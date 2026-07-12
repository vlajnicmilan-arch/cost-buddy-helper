-- Ensure FK project_funding.income_source_id -> income_sources(id) exists.
--
-- Historical context: 20260125120000 already creates public.project_funding with
-- an inline `REFERENCES public.income_sources(id) ON DELETE CASCADE`, which
-- Postgres auto-names `project_funding_income_source_id_fkey`. On production
-- this migration was originally recorded to guarantee the constraint existed
-- (the inline FK was missing on the out-of-band created table). On greenfield
-- replays the inline FK is already present, so a plain ADD CONSTRAINT fails
-- with SQLSTATE 42710 (constraint already exists).
--
-- Fix: make the statement idempotent. No-op on greenfield (FK already there),
-- still adds it on legacy production databases where it was missing. Final
-- schema is identical in both cases, and supabase_migrations bookkeeping is
-- preserved because the migration file/id is unchanged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_funding_income_source_id_fkey'
      AND conrelid = 'public.project_funding'::regclass
  ) THEN
    ALTER TABLE public.project_funding
      ADD CONSTRAINT project_funding_income_source_id_fkey
      FOREIGN KEY (income_source_id)
      REFERENCES public.income_sources(id)
      ON DELETE CASCADE;
  END IF;
END $$;
