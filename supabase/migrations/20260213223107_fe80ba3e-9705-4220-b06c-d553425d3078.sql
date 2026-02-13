
-- Add invited_user_id to payment_source_invitations for in-app notification delivery
ALTER TABLE public.payment_source_invitations ADD COLUMN invited_user_id uuid;

-- Allow invited users to see their own invitations
CREATE POLICY "Invited users can view their invitations"
  ON public.payment_source_invitations FOR SELECT
  TO authenticated
  USING (invited_user_id = auth.uid());
