-- Realign expenses RLS to owner model + retire is_project_manager
-- Root cause: historical migration 20260609034641 dropped is_project_manager
-- but two policies on public.expenses still referenced it (UPDATE + DELETE),
-- blocking clean-reset replay with SQLSTATE 2BP01. This forward migration
-- swaps those two policies to public.is_project_owner and then drops the
-- function. Idempotent on prod (function already gone; DROP FUNCTION IF EXISTS
-- is a no-op).

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