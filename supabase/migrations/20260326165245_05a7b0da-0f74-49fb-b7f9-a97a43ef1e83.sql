DROP POLICY IF EXISTS "Owners can create savings goals" ON public.savings_goals;
CREATE POLICY "Owners can create savings goals"
  ON public.savings_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (is_budget_owner(budget_id, auth.uid()) AND auth.uid() = user_id);