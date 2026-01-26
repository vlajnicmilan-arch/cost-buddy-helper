-- Add used_at column to track one-time token usage
ALTER TABLE public.project_invitations 
ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.budget_invitations 
ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster token lookup
CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON public.project_invitations(token);
CREATE INDEX IF NOT EXISTS idx_budget_invitations_token ON public.budget_invitations(token);

-- Create function to validate and consume one-time token atomically
CREATE OR REPLACE FUNCTION public.consume_invitation_token(
  _token UUID,
  _invitation_type TEXT
)
RETURNS TABLE(
  invitation_id UUID,
  target_id UUID,
  role TEXT,
  invited_by UUID,
  target_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invitation RECORD;
  _target_name TEXT;
BEGIN
  IF _invitation_type = 'project' THEN
    -- Lock the row and validate in one atomic operation
    UPDATE public.project_invitations
    SET used_at = NOW()
    WHERE token = _token
      AND status = 'pending'
      AND expires_at > NOW()
      AND used_at IS NULL
    RETURNING id, project_id, project_invitations.role, project_invitations.invited_by
    INTO _invitation;
    
    IF _invitation IS NULL THEN
      RETURN;
    END IF;
    
    -- Get project name
    SELECT name INTO _target_name FROM public.projects WHERE id = _invitation.project_id;
    
    RETURN QUERY SELECT 
      _invitation.id,
      _invitation.project_id,
      _invitation.role,
      _invitation.invited_by,
      _target_name;
      
  ELSIF _invitation_type = 'budget' THEN
    -- Lock the row and validate in one atomic operation
    UPDATE public.budget_invitations
    SET used_at = NOW()
    WHERE token = _token
      AND status = 'pending'
      AND expires_at > NOW()
      AND used_at IS NULL
    RETURNING id, budget_id, budget_invitations.role, budget_invitations.invited_by
    INTO _invitation;
    
    IF _invitation IS NULL THEN
      RETURN;
    END IF;
    
    -- Get budget name
    SELECT name INTO _target_name FROM public.budget_plans WHERE id = _invitation.budget_id;
    
    RETURN QUERY SELECT 
      _invitation.id,
      _invitation.budget_id,
      _invitation.role,
      _invitation.invited_by,
      _target_name;
  END IF;
END;
$$;