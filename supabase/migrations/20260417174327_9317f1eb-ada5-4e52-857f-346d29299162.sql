-- 1. Create the table
CREATE TABLE public.app_diagnostics_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  event TEXT NOT NULL,
  route TEXT,
  details JSONB,
  device_info JSONB,
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_app_diagnostics_logs_session_id ON public.app_diagnostics_logs(session_id);
CREATE INDEX idx_app_diagnostics_logs_created_at ON public.app_diagnostics_logs(created_at DESC);
CREATE INDEX idx_app_diagnostics_logs_event ON public.app_diagnostics_logs(event);
CREATE INDEX idx_app_diagnostics_logs_user_id ON public.app_diagnostics_logs(user_id) WHERE user_id IS NOT NULL;

-- 2. Enable RLS
ALTER TABLE public.app_diagnostics_logs ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- INSERT: anyone (anon + authenticated) can insert logs
CREATE POLICY "Anyone can insert diagnostic logs"
ON public.app_diagnostics_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- SELECT: only admins
CREATE POLICY "Only admins can view diagnostic logs"
ON public.app_diagnostics_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- DELETE: only admins (manual cleanup)
CREATE POLICY "Only admins can delete diagnostic logs"
ON public.app_diagnostics_logs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_diagnostics_logs;
ALTER TABLE public.app_diagnostics_logs REPLICA IDENTITY FULL;

-- 5. Cleanup function — deletes logs older than 7 days
CREATE OR REPLACE FUNCTION public.cleanup_old_diagnostic_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.app_diagnostics_logs
  WHERE created_at < now() - interval '7 days';
END;
$$;

-- 6. Schedule cleanup (hourly) via pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-diagnostic-logs');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-diagnostic-logs',
      '0 * * * *',
      $cron$ SELECT public.cleanup_old_diagnostic_logs(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;