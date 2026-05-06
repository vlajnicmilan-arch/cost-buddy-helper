ALTER TABLE public.monitor_alerts_log
  ADD COLUMN IF NOT EXISTS notified_email BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'cron';

COMMENT ON COLUMN public.monitor_alerts_log.notified_email IS 'True ako je crash alert email poslan adminima';
COMMENT ON COLUMN public.monitor_alerts_log.source IS 'cron | error_boundary | window_error — odakle je alert pokrenut';