-- Harness-only SECURITY DEFINER helpers for pausing / resuming pg_cron jobs
-- during the stress smoke run.
--
-- Why this file exists:
--   Local Supabase (>= pg_cron 1.6) owns cron.job as `supabase_admin` and
--   does NOT grant UPDATE to the `postgres` role. The harness normally
--   connects as `postgres`, so a direct `UPDATE cron.job SET active = false`
--   fails with `permission denied for table job`.
--
-- Fix:
--   Install two SECURITY DEFINER functions owned by a superuser
--   (`supabase_admin` in local dev). They snapshot / flip / restore
--   `cron.job.active` on behalf of any role that has EXECUTE. We only grant
--   EXECUTE to `postgres` so this remains harness-only in local dev.
--
-- This file MUST be executed as a role that owns cron.job (superuser).
-- Production `supabase db push` never runs this — it lives only under
-- stress/bin/ and is invoked exclusively by stress/bin/bootstrap-local-db.sh.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    RAISE EXCEPTION 'bootstrap-cron-helpers: pg_cron not installed — bootstrap-cron-extensions.sql must run first';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.stress_cron_snapshot (
  jobid           BIGINT PRIMARY KEY,
  jobname         TEXT,
  schedule        TEXT,
  original_active BOOLEAN NOT NULL,
  snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pause: snapshot current cron.job.active state (once), then flip all
-- active rows to false. Idempotent. Returns number of jobs currently paused.
CREATE OR REPLACE FUNCTION public.stress_pause_cron()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  paused_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stress_cron_snapshot LIMIT 1) THEN
    INSERT INTO public.stress_cron_snapshot (jobid, jobname, schedule, original_active)
    SELECT jobid, jobname, schedule, active FROM cron.job;
  END IF;

  UPDATE cron.job SET active = false WHERE active = true;

  SELECT count(*) INTO paused_count FROM cron.job WHERE active = false;
  RETURN paused_count;
END;
$$;

-- Resume: restore cron.job.active from snapshot and drop the snapshot table.
-- Idempotent — safe to call even when there is nothing to restore.
CREATE OR REPLACE FUNCTION public.stress_resume_cron()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  restored_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'stress_cron_snapshot') THEN
    RETURN 0;
  END IF;

  UPDATE cron.job j
     SET active = s.original_active
    FROM public.stress_cron_snapshot s
   WHERE j.jobid = s.jobid;

  SELECT count(*) INTO restored_count FROM public.stress_cron_snapshot;
  DROP TABLE public.stress_cron_snapshot;
  RETURN restored_count;
END;
$$;

-- Read-only helper: count currently active cron jobs. Same rationale as
-- pause/resume — `postgres` has no SELECT right on cron.job in local
-- Supabase, so preflight / invariant sweeps MUST go through this definer
-- helper instead of `SELECT ... FROM cron.job` directly.
CREATE OR REPLACE FUNCTION public.stress_active_cron_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM cron.job WHERE active = true;
  RETURN n;
END;
$$;

-- Lock down: revoke public, grant EXECUTE only to the role the harness uses.
REVOKE ALL ON FUNCTION public.stress_pause_cron()        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stress_resume_cron()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stress_active_cron_count() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.stress_pause_cron()        TO postgres;
GRANT  EXECUTE ON FUNCTION public.stress_resume_cron()       TO postgres;
GRANT  EXECUTE ON FUNCTION public.stress_active_cron_count() TO postgres;
