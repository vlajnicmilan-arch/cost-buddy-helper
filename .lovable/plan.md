# Fix: `DROP FUNCTION public.is_project_manager(uuid,uuid)` clean-reset blocker

## Root cause (verified by inspection)
`supabase/migrations/20260609034641_…sql:177` — `DROP FUNCTION IF EXISTS public.is_project_manager(uuid, uuid);` — fails with SQLSTATE 2BP01 because two RLS policies on `public.expenses` still depend on the function:

- `Users can update their own expenses` (USING + WITH CHECK) — `20260125120000_…sql` lines 270–282
- `Users can delete their own expenses` (USING) — `20260125120000_…sql` lines 284–291

No later migration redefines them. 034641 handles every other historical dependent (workers, work logs/entries, milestones, funding, collaborators, invitations, members). `20260609031605` (which recreates the function) touches only `project_*` tables. The `SELECT` policy on `expenses` uses `is_project_member`, not `is_project_manager`, so it is unaffected.

## Smallest history-safe fix — two coordinated changes

### Change 1 — new forward-only migration
Create `supabase/migrations/20260712000000_expenses_drop_is_project_manager.sql`:

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

Semantic rationale: `is_project_owner` matches the owner model 034641 establishes for every other project-scoped table. Manager role no longer exists.

### Change 2 — harness-only neutralization of line 177
Extend `stress/bin/bootstrap-local-db.sh` PHASE 4 with a PHASE 4b block that operates on the already-swapped harness copy of `supabase/migrations/`. It locates `20260609034641_*.sql` and replaces:

```
DROP FUNCTION IF EXISTS public.is_project_manager(uuid, uuid);
```

with:

```
SELECT 1; -- stress-harness: DROP FUNCTION public.is_project_manager moved to forward migration 20260712000000
```

Same swap/restore mechanism already used for `pg_cron`/`pg_net` in PHASE 4. Trap `cleanup_all` restores the original directory on exit. Real repo files are never modified.

## Why history-safe
- **Prod DBs past 034641**: function already gone. Change 1's `DROP POLICY IF EXISTS` + `CREATE POLICY` recreates the two expenses policies with `is_project_owner`; the final `DROP FUNCTION IF EXISTS` is a no-op. No data mutated.
- **Clean replay (CI/local/stress)**: harness neutralizes only line 177 in the temp copy → 034641 succeeds → Change 1 runs → dependents removed and function dropped.
- **Production `supabase db push`**: untouched — harness never edits the real repo files.
- **No historical migration is rewritten in the repo.** `20260125120000` and `20260609034641` remain byte-identical in git.

## Files touched
1. `supabase/migrations/20260712000000_expenses_drop_is_project_manager.sql` — new (via supabase migration tool).
2. `stress/bin/bootstrap-local-db.sh` — insert PHASE 4b block between existing PHASE 4 sanity check and PHASE 5.

## Verification after implementation
1. Manually trigger `stress-smoke` workflow.
2. Confirm PHASE 5 (`supabase migration up --include-all`) passes 034641 with no `is_project_manager` error.
3. Report next blocker verbatim from the log, if any.
4. No claim of success without a fresh rerun.
