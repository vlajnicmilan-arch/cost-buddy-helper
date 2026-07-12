-- Restore cron.job.active from stress_cron_snapshot. Idempotent.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    RAISE NOTICE 'pg_cron not installed — nothing to resume';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'stress_cron_snapshot') THEN
    RAISE NOTICE 'No snapshot table — nothing to resume';
    RETURN;
  END IF;

  UPDATE cron.job j
     SET active = s.original_active
    FROM public.stress_cron_snapshot s
   WHERE j.jobid = s.jobid;

  RAISE NOTICE 'Resumed % cron jobs from snapshot',
    (SELECT count(*) FROM public.stress_cron_snapshot);

  DROP TABLE public.stress_cron_snapshot;
END$$;
