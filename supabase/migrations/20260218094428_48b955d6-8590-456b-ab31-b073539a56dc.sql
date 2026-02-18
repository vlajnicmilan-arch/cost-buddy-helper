
-- Add invited_user_id to project_invitations and budget_invitations for proper RLS
ALTER TABLE public.project_invitations 
  ADD COLUMN IF NOT EXISTS invited_user_id uuid;

ALTER TABLE public.budget_invitations 
  ADD COLUMN IF NOT EXISTS invited_user_id uuid;

-- Add RLS policy: invited users can view their own project invitations
CREATE POLICY "Invited users can view their project invitations"
  ON public.project_invitations
  FOR SELECT
  USING (invited_user_id = auth.uid());

-- Add RLS policy: invited users can view their own budget invitations  
CREATE POLICY "Invited users can view their budget invitations"
  ON public.budget_invitations
  FOR SELECT
  USING (invited_user_id = auth.uid());
