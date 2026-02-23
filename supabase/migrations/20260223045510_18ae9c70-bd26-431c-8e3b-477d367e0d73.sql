
-- Table to track user logins with device info
CREATE TABLE public.user_login_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_info jsonb DEFAULT '{}'::jsonb,
  logged_in_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own login logs
CREATE POLICY "Users can insert their own login logs"
  ON public.user_login_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own login logs
CREATE POLICY "Users can view their own login logs"
  ON public.user_login_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all login logs
CREATE POLICY "Admins can view all login logs"
  ON public.user_login_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Index for faster lookups
CREATE INDEX idx_user_login_logs_user_id ON public.user_login_logs (user_id);
CREATE INDEX idx_user_login_logs_logged_in_at ON public.user_login_logs (logged_in_at DESC);
