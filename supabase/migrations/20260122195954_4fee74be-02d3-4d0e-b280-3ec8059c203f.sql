-- Create function to delete expired invitations
CREATE OR REPLACE FUNCTION public.delete_expired_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete all expired invitations
  DELETE FROM public.income_source_invitations
  WHERE expires_at < now() AND status = 'pending';
  RETURN NULL;
END;
$$;

-- Create trigger that runs on every insert to clean up expired invitations
CREATE TRIGGER cleanup_expired_invitations
AFTER INSERT ON public.income_source_invitations
FOR EACH STATEMENT
EXECUTE FUNCTION public.delete_expired_invitations();