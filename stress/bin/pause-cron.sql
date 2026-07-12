-- Pause all pg_cron jobs via the harness SECURITY DEFINER helper.
--
-- The helper (public.stress_pause_cron) is installed by
-- stress/bin/bootstrap-local-db.sh (PHASE 3b) as `supabase_admin`, because
-- cron.job is owned by supabase_admin and postgres has no UPDATE right.
-- Calling the definer function keeps this harness step working as the
-- `postgres` role without touching production migrations or cron.job grants.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping (no cron jobs to pause)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'stress_pause_cron'
  ) THEN
    RAISE EXCEPTION
      'stress_pause_cron() helper is missing — bootstrap-local-db.sh must install it via supabase_admin first';
  END IF;

  PERFORM public.stress_pause_cron();
  RAISE NOTICE 'Paused all cron jobs via stress_pause_cron()';
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
