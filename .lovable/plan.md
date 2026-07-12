# Fix: `DROP FUNCTION public.is_project_manager(uuid,uuid)` clean-reset blocker

## Root cause (verified by inspection)
At `supabase/migrations/20260609034641_…sql:177` the drop fails because two RLS policies on `public.expenses` still reference `is_project_manager(project_id, auth.uid())`:
- `Users can update their own expenses` (USING + WITH CHECK) — created in `20260125120000_…sql` lines 270–282
- `Users can delete their own expenses` (USING) — created in `20260125120000_…sql` lines 284–291

No migration between `20260125120000` and `20260609034641` redefines these two policies. Migration `20260609031605` only touches `project_*` tables. All other historical `is_project_manager` dependents ARE handled inside 034641 (sections 2 and 2-cont). Only `expenses` was missed.

## Smallest history-safe fix

### Step 1 — new forward-only migration
Create `supabase/migrations/<new_ts>_expenses_drop_is_project_manager.sql`:

```sql
-- Realign expenses RLS to owner model + retire is_project_manager

DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id)
  OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
  OR ((project_id IS NOT NULL) AND public.is_project_owner(project_id, auth.uid()))
)
WITH CHECK (
  (auth.uid() = user_id)
  OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
  OR ((project_id IS NOT NULL) AND public.is_project_owner(project_id, auth.uid()))
);

DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses"
ON public.expenses FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id)
  OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
  OR ((project_id IS NOT NULL) AND public.is_project_owner(project_id, auth.uid()))
);

DROP FUNCTION IF EXISTS public.is_project_manager(uuid, uuid);
```

Rationale for `is_project_owner`: matches the ownership model that 034641 establishes for every other project-scoped table (workers, work logs/entries, milestones, funding, collaborators, invitations, members). No manager role exists any more per project memory.

### Step 2 — neutralise line 177 in 034641
Replace:
```sql
-- 4) Drop is_project_manager
DROP FUNCTION IF EXISTS public.is_project_manager(uuid, uuid);
```
with:
```sql
-- 4) Drop is_project_manager — moved to <new_ts>_expenses_drop_is_project_manager.sql
--    (expenses UPDATE/DELETE policies still referenced it here; see that migration)
```

## Why this is history-safe
- **Prod DBs already past 034641**: function is already gone. New migration's `DROP POLICY IF EXISTS` + `CREATE POLICY` recreates the two expenses policies using `is_project_owner`; the trailing `DROP FUNCTION IF EXISTS` is a no-op. No data mutated.
- **Clean replay (CI, local, stress harness)**: 034641 now stops before the dropped-manager step; the new migration removes the two dependents and then drops the function. Chain succeeds.
- **Semantics**: on prod, UPDATE/DELETE on expenses referencing a project currently allow `is_project_manager` (owner-seeded rows only, since 034641 already deleted owner-self manager rows and rewrote every other table). Swapping to `is_project_owner` preserves the effective grant for owners and closes an inconsistency where a hypothetical non-owner manager row could still edit expenses.
- **No historical logic rewritten**: 034641's only change is a comment. `20260125120000` is untouched.

## Files touched
1. `supabase/migrations/20260609034641_7dc2d645-6bde-4370-97fb-adfbe67d776b.sql` — line 177 becomes comment.
2. `supabase/migrations/<new_ts>_expenses_drop_is_project_manager.sql` — new file (SQL above).

## Verification after implementation
1. Trigger `stress-smoke` workflow; expect PHASE 5 (`supabase migration up --include-all`) to pass past 034641 with no `is_project_manager` error.
2. Report the next blocker (if any) verbatim from the log.
3. No claim of success without a fresh green (or clearly-past-034641) rerun.
