-- ============================================================================
-- HISTORICAL MIGRATION — NEUTRALIZED DUPLICATE
-- ----------------------------------------------------------------------------
-- Originally this migration created public.projects, public.project_members,
-- public.project_milestones, public.project_funding, public.project_invitations,
-- their RLS policies, the shared update_updated_at_column() trigger fn and
-- the *_updated_at triggers.
--
-- All of those objects were ALREADY created ~1h earlier in
--   20260125120000_5757989b-ee9d-4a86-ba34-2956054b4c51.sql
-- (with the "correct" schema: status/role as ENUM types, project members
-- auto-linked via on_project_created trigger, etc.).
--
-- Running the original body on a clean database (supabase db reset / fresh
-- CI runner) crashes with:
--   ERROR: relation "projects" already exists (SQLSTATE 42P07)
--
-- Production only got past this once because the migration was applied at a
-- point in history where 120000 had NOT yet been introduced, or the state was
-- repaired manually. On any greenfield replay the two collide.
--
-- We MUST NOT drop the file (that would break `supabase_migrations` on
-- environments that already recorded it), and we MUST NOT re-run the CREATE
-- TABLE/POLICY/TRIGGER statements. The ONLY things this file contributes
-- that 120000 does not, and that downstream migrations depend on, are:
--   1) public.is_project_owner(_project_id, _user_id)  — used by 20+ later files
--   2) project_members.display_name column              — used by 20260125133628
--
-- Everything else is a strict duplicate and is intentionally omitted here.
-- Final schema after this file remains identical to production.
-- ============================================================================

-- (1) is_project_owner — downstream RLS policies depend on this function name.
CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $FN$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  );
END;
$FN$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- (2) project_members.display_name — used by 20260125133628 backfill migration.
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS display_name TEXT;
