
-- Idempotent setup of auto-invoice-reminders daily cron job
DO $$
BEGIN
  -- Unschedule if already exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-invoice-reminders-daily') THEN
    PERFORM cron.unschedule('auto-invoice-reminders-daily');
  END IF;

  PERFORM cron.schedule(
    'auto-invoice-reminders-daily',
    '0 9 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/auto-invoice-reminders',
      headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw"}'::jsonb,
      body := jsonb_build_object('triggered_at', now())
    );
    $cron$
  );
END $$;
