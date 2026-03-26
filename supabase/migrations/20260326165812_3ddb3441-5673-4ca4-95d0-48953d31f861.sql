-- Restrict family invitation viewing to owners only (consistent with budget/payment_source invitations)
DROP POLICY IF EXISTS "Members can view invitations" ON public.family_invitations;
CREATE POLICY "Owners can view all invitations"
  ON public.family_invitations
  FOR SELECT
  TO authenticated
  USING (is_family_owner(group_id, auth.uid()));