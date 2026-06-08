ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS participant_digest_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS participant_digest_hour    smallint NOT NULL DEFAULT 19
    CHECK (participant_digest_hour BETWEEN 6 AND 23);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flush-participant-digest-daily') THEN
    PERFORM cron.unschedule('flush-participant-digest-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flush-participant-digest-hourly') THEN
    PERFORM cron.unschedule('flush-participant-digest-hourly');
  END IF;

  PERFORM cron.schedule(
    'flush-participant-digest-hourly',
    '0 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/flush-participant-digest',
      headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw"}'::jsonb,
      body := jsonb_build_object('triggered_at', now())
    );
    $cron$
  );
END $$;