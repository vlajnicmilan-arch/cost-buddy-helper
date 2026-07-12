-- Restore cron.job.active from snapshot via the harness SECURITY DEFINER
-- helper. See stress/bin/pause-cron.sql for the rationale.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    RAISE NOTICE 'pg_cron not installed — nothing to resume';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'stress_resume_cron'
  ) THEN
    RAISE NOTICE 'stress_resume_cron() helper missing — nothing to resume';
    RETURN;
  END IF;

  PERFORM public.stress_resume_cron();
  RAISE NOTICE 'Resumed cron jobs via stress_resume_cron()';
END$$;
