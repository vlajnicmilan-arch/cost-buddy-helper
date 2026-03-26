-- Fix: Change policy from 'public' to 'authenticated' to prevent unauthenticated access
DROP POLICY IF EXISTS "Invited users can view their budget invitations" ON public.budget_invitations;
CREATE POLICY "Invited users can view their budget invitations"
  ON public.budget_invitations
  FOR SELECT
  TO authenticated
  USING (invited_user_id = auth.uid());