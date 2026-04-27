CREATE TABLE IF NOT EXISTS public.activation_nudge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_number integer NOT NULL CHECK (day_number IN (1, 3, 7)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_activation_nudge_log_user
  ON public.activation_nudge_log (user_id);

ALTER TABLE public.activation_nudge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activation nudges"
  ON public.activation_nudge_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));