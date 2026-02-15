-- Drop the old overloaded function with UUID parameter type that conflicts
DROP FUNCTION IF EXISTS public.consume_invitation_token(uuid, text);
