
-- ============================================================
-- PULSE MONITORING — tables, RLS, indexes, cleanup
-- ============================================================

-- 1) monitor_alerts_log — sent alert deduplication & history
CREATE TABLE IF NOT EXISTS public.monitor_alerts_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_signature TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_count INTEGER NOT NULL DEFAULT 0,
  affected_users INTEGER NOT NULL DEFAULT 0,
  sample_message TEXT,
  sample_route TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitor_alerts_signature_time
  ON public.monitor_alerts_log (alert_signature, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitor_alerts_triggered
  ON public.monitor_alerts_log (triggered_at DESC);

ALTER TABLE public.monitor_alerts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read monitor alerts"
  ON public.monitor_alerts_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- (no INSERT/UPDATE/DELETE policies — only service role writes)


-- 2) health_summaries — AI generated daily summaries
CREATE TABLE IF NOT EXISTS public.health_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  summary_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  language TEXT NOT NULL DEFAULT 'hr',
  summary_text TEXT NOT NULL,
  metrics_json JSONB,
  generated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_summaries_date
  ON public.health_summaries (summary_date DESC);

ALTER TABLE public.health_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read health summaries"
  ON public.health_summaries
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert health summaries"
  ON public.health_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- 3) Cleanup functions
CREATE OR REPLACE FUNCTION public.cleanup_old_monitor_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.monitor_alerts_log
  WHERE created_at < now() - interval '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_health_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.health_summaries
  WHERE created_at < now() - interval '30 days';
END;
$$;


-- 4) Helper indexes on app_diagnostics_logs for fast pulse aggregations
CREATE INDEX IF NOT EXISTS idx_app_diag_event_time
  ON public.app_diagnostics_logs (event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_diag_route_time
  ON public.app_diagnostics_logs (route, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_diag_session_time
  ON public.app_diagnostics_logs (session_id, created_at DESC);
