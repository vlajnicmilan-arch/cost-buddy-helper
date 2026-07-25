-- P1 fix: block user_id spoofing on app_diagnostics_logs INSERT.
-- Allow anonymous crash logs (user_id NULL, pre-login) OR own user id.
DROP POLICY IF EXISTS "Anyone can insert diagnostic logs" ON public.app_diagnostics_logs;

CREATE POLICY "Anyone can insert diagnostic logs"
  ON public.app_diagnostics_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());