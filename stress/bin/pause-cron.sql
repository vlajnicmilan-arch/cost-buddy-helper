-- Pause all pg_cron jobs and snapshot original state.
-- Snapshot lives in a dedicated table so resume-cron.sql can restore it 1:1.
--
-- Safe to run multiple times: snapshot is only written if empty; subsequent
-- pauses only flip active=false.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping (no cron jobs to pause)';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.stress_cron_snapshot (
    jobid BIGINT PRIMARY KEY,
    jobname TEXT,
    schedule TEXT,
    original_active BOOLEAN NOT NULL,
    snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  IF NOT EXISTS (SELECT 1 FROM public.stress_cron_snapshot LIMIT 1) THEN
    INSERT INTO public.stress_cron_snapshot (jobid, jobname, schedule, original_active)
    SELECT jobid, jobname, schedule, active FROM cron.job;
    RAISE NOTICE 'Snapshotted % cron jobs', (SELECT count(*) FROM public.stress_cron_snapshot);
  ELSE
    RAISE NOTICE 'Snapshot already exists — reusing';
  END IF;

  UPDATE cron.job SET active = false WHERE active = true;
  RAISE NOTICE 'Paused all cron jobs';
END$$;

-- Verify: must be zero active jobs after this script.
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM cron.job WHERE active = true;
  IF n > 0 THEN
    RAISE EXCEPTION 'pause-cron failed: % jobs still active', n;
  END IF;
END$$;
