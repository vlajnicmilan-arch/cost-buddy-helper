CREATE TABLE IF NOT EXISTS public.project_activity_push_throttle (
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  activity_bucket text NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  pending_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id, activity_bucket)
);

ALTER TABLE public.project_activity_push_throttle ENABLE ROW LEVEL SECURITY;

-- No client access; only service role uses it from edge functions.
CREATE POLICY "deny all to clients"
  ON public.project_activity_push_throttle
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_papt_last_sent
  ON public.project_activity_push_throttle (last_sent_at);