-- Local clean-replay bootstrap for migrations that schedule pg_cron jobs.
-- This is executed by the stress smoke workflow/harness before the app
-- migration chain is replayed, so CREATE EXTENSION in historical migrations
-- becomes a no-op instead of requiring pg_read_file during replay.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;