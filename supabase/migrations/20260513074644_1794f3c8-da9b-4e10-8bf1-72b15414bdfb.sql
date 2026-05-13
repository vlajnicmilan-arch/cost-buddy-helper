-- Add last_used_at to push_tokens
ALTER TABLE public.push_tokens
ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_push_tokens_last_used_at
ON public.push_tokens (last_used_at);

-- Enable extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cleanup function: delete tokens older than 60 days that have never been used
-- or whose last_used_at is older than 60 days
CREATE OR REPLACE FUNCTION public.cleanup_stale_push_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.push_tokens
  WHERE created_at < now() - interval '60 days'
    AND (last_used_at IS NULL OR last_used_at < now() - interval '60 days');
END;
$$;