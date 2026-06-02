ALTER TABLE public.notification_preferences
ADD COLUMN IF NOT EXISTS daily_summary_state JSONB NOT NULL DEFAULT '{}'::jsonb;