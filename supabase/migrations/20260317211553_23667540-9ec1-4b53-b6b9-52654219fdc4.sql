
-- Allow all family members to INSERT shared sources (not just owners)
DROP POLICY IF EXISTS "Owners can manage shared sources" ON public.family_shared_sources;
CREATE POLICY "Members can add shared sources"
  ON public.family_shared_sources FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(group_id, auth.uid()) AND auth.uid() = added_by);

-- Allow members to delete their own shared sources, owners can delete any
DROP POLICY IF EXISTS "Owners can remove shared sources" ON public.family_shared_sources;
CREATE POLICY "Members can remove own shared sources"
  ON public.family_shared_sources FOR DELETE
  TO authenticated
  USING (is_family_member(group_id, auth.uid()) AND (auth.uid() = added_by OR is_family_owner(group_id, auth.uid())));

-- Allow all family members to INSERT shared budgets (not just owners)
DROP POLICY IF EXISTS "Owners can manage shared budgets" ON public.family_shared_budgets;
CREATE POLICY "Members can add shared budgets"
  ON public.family_shared_budgets FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(group_id, auth.uid()) AND auth.uid() = added_by);

-- Allow members to delete their own shared budgets, owners can delete any
DROP POLICY IF EXISTS "Owners can remove shared budgets" ON public.family_shared_budgets;
CREATE POLICY "Members can remove own shared budgets"
  ON public.family_shared_budgets FOR DELETE
  TO authenticated
  USING (is_family_member(group_id, auth.uid()) AND (auth.uid() = added_by OR is_family_owner(group_id, auth.uid())));

-- Allow all family members to INSERT shared projects (not just owners)
DROP POLICY IF EXISTS "Owners can manage shared projects" ON public.family_shared_projects;
CREATE POLICY "Members can add shared projects"
  ON public.family_shared_projects FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(group_id, auth.uid()) AND auth.uid() = added_by);

-- Allow members to delete their own shared projects, owners can delete any
DROP POLICY IF EXISTS "Owners can remove shared projects" ON public.family_shared_projects;
CREATE POLICY "Members can remove own shared projects"
  ON public.family_shared_projects FOR DELETE
  TO authenticated
  USING (is_family_member(group_id, auth.uid()) AND (auth.uid() = added_by OR is_family_owner(group_id, auth.uid())));

-- Allow all family members to INSERT shared savings (not just owners)
DROP POLICY IF EXISTS "Owners can manage shared savings" ON public.family_shared_savings;
CREATE POLICY "Members can add shared savings"
  ON public.family_shared_savings FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(group_id, auth.uid()) AND auth.uid() = added_by);

-- Allow members to delete their own shared savings, owners can delete any
DROP POLICY IF EXISTS "Owners can remove shared savings" ON public.family_shared_savings;
CREATE POLICY "Members can remove own shared savings"
  ON public.family_shared_savings FOR DELETE
  TO authenticated
  USING (is_family_member(group_id, auth.uid()) AND (auth.uid() = added_by OR is_family_owner(group_id, auth.uid())));
