
-- Fix family_groups policies: drop restrictive, recreate as permissive
DROP POLICY IF EXISTS "Users can create groups" ON public.family_groups;
DROP POLICY IF EXISTS "Members can view their groups" ON public.family_groups;
DROP POLICY IF EXISTS "Owners can update groups" ON public.family_groups;
DROP POLICY IF EXISTS "Owners can delete groups" ON public.family_groups;

CREATE POLICY "Users can create groups" ON public.family_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members can view their groups" ON public.family_groups FOR SELECT TO authenticated USING (is_family_member(id, auth.uid()));
CREATE POLICY "Owners can update groups" ON public.family_groups FOR UPDATE TO authenticated USING (is_family_owner(id, auth.uid()));
CREATE POLICY "Owners can delete groups" ON public.family_groups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix family_members policies
DROP POLICY IF EXISTS "Members can view group members" ON public.family_members;
DROP POLICY IF EXISTS "Owners can add members" ON public.family_members;
DROP POLICY IF EXISTS "Owners can remove members" ON public.family_members;
DROP POLICY IF EXISTS "Owners can update members" ON public.family_members;

CREATE POLICY "Members can view group members" ON public.family_members FOR SELECT TO authenticated USING (is_family_member(group_id, auth.uid()));
CREATE POLICY "Owners can add members" ON public.family_members FOR INSERT TO authenticated WITH CHECK (is_family_owner(group_id, auth.uid()));
CREATE POLICY "Owners can remove members" ON public.family_members FOR DELETE TO authenticated USING (is_family_owner(group_id, auth.uid()));
CREATE POLICY "Owners can update members" ON public.family_members FOR UPDATE TO authenticated USING (is_family_owner(group_id, auth.uid()));

-- Fix family_invitations policies
DROP POLICY IF EXISTS "Members can view invitations" ON public.family_invitations;
DROP POLICY IF EXISTS "Owners can create invitations" ON public.family_invitations;
DROP POLICY IF EXISTS "Owners can delete invitations" ON public.family_invitations;

CREATE POLICY "Members can view invitations" ON public.family_invitations FOR SELECT TO authenticated USING (is_family_member(group_id, auth.uid()));
CREATE POLICY "Owners can create invitations" ON public.family_invitations FOR INSERT TO authenticated WITH CHECK (is_family_owner(group_id, auth.uid()));
CREATE POLICY "Owners can delete invitations" ON public.family_invitations FOR DELETE TO authenticated USING (is_family_owner(group_id, auth.uid()));

-- Fix family_shared_sources policies
DROP POLICY IF EXISTS "Members can view shared sources" ON public.family_shared_sources;
DROP POLICY IF EXISTS "Owners can manage shared sources" ON public.family_shared_sources;
DROP POLICY IF EXISTS "Owners can remove shared sources" ON public.family_shared_sources;

CREATE POLICY "Members can view shared sources" ON public.family_shared_sources FOR SELECT TO authenticated USING (is_family_member(group_id, auth.uid()));
CREATE POLICY "Owners can manage shared sources" ON public.family_shared_sources FOR INSERT TO authenticated WITH CHECK (is_family_owner(group_id, auth.uid()));
CREATE POLICY "Owners can remove shared sources" ON public.family_shared_sources FOR DELETE TO authenticated USING (is_family_owner(group_id, auth.uid()));

-- Fix family_shared_budgets policies
DROP POLICY IF EXISTS "Members can view shared budgets" ON public.family_shared_budgets;
DROP POLICY IF EXISTS "Owners can manage shared budgets" ON public.family_shared_budgets;
DROP POLICY IF EXISTS "Owners can remove shared budgets" ON public.family_shared_budgets;

CREATE POLICY "Members can view shared budgets" ON public.family_shared_budgets FOR SELECT TO authenticated USING (is_family_member(group_id, auth.uid()));
CREATE POLICY "Owners can manage shared budgets" ON public.family_shared_budgets FOR INSERT TO authenticated WITH CHECK (is_family_owner(group_id, auth.uid()));
CREATE POLICY "Owners can remove shared budgets" ON public.family_shared_budgets FOR DELETE TO authenticated USING (is_family_owner(group_id, auth.uid()));
