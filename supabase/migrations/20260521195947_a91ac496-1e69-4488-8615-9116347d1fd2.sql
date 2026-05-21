CREATE TABLE public.dashboard_telemetry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  event_type text NOT NULL CHECK (event_type IN ('section_view','section_click','scroll_depth')),
  section text NOT NULL,
  value integer,
  platform text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dashboard_telemetry_user ON public.dashboard_telemetry(user_id);
CREATE INDEX idx_dashboard_telemetry_occurred ON public.dashboard_telemetry(occurred_at DESC);
CREATE INDEX idx_dashboard_telemetry_section ON public.dashboard_telemetry(section, event_type);

ALTER TABLE public.dashboard_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own telemetry"
  ON public.dashboard_telemetry FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users view own telemetry"
  ON public.dashboard_telemetry FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all telemetry"
  ON public.dashboard_telemetry FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));