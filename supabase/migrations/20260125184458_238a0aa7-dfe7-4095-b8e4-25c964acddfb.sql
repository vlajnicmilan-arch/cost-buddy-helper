-- Fix expenses UPDATE policy to include project members
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses" ON public.expenses
FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id 
  OR (income_source_id IS NOT NULL AND is_income_source_member(income_source_id, auth.uid()))
  OR (project_id IS NOT NULL AND is_project_member(project_id, auth.uid()))
)
WITH CHECK (
  auth.uid() = user_id 
  OR (income_source_id IS NOT NULL AND is_income_source_member(income_source_id, auth.uid()))
  OR (project_id IS NOT NULL AND is_project_member(project_id, auth.uid()))
);

-- Fix expenses DELETE policy to include project members (only manager or transaction owner)
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses" ON public.expenses
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id 
  OR (income_source_id IS NOT NULL AND is_income_source_owner(auth.uid(), income_source_id))
  OR (project_id IS NOT NULL AND (
    is_project_owner(project_id, auth.uid()) 
    OR auth.uid() = submitted_by
  ))
);

-- Fix transaction_notes SELECT policy to include project members
DROP POLICY IF EXISTS "Users can view notes on accessible transactions" ON public.transaction_notes;
CREATE POLICY "Users can view notes on accessible transactions" ON public.transaction_notes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = transaction_notes.expense_id
    AND (
      e.user_id = auth.uid()
      OR (e.income_source_id IS NOT NULL AND is_income_source_member(e.income_source_id, auth.uid()))
      OR (e.project_id IS NOT NULL AND is_project_member(e.project_id, auth.uid()))
    )
  )
);

-- Fix transaction_notes INSERT policy to include project members
DROP POLICY IF EXISTS "Users can add notes to accessible transactions" ON public.transaction_notes;
CREATE POLICY "Users can add notes to accessible transactions" ON public.transaction_notes
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = transaction_notes.expense_id
    AND (
      e.user_id = auth.uid()
      OR (e.income_source_id IS NOT NULL AND is_income_source_member(e.income_source_id, auth.uid()))
      OR (e.project_id IS NOT NULL AND is_project_member(e.project_id, auth.uid()))
    )
  )
);