-- CI-only shim: dynamically REVOKE EXECUTE FROM anon, PUBLIC on every callable
-- SECURITY DEFINER function in `public` that would otherwise be reported by
-- supabase/tests/security/secdef_anon_invariant.sql.
--
-- Why this exists:
-- The invariant test enforces production reality (0 anon-executable SECDEF
-- funcs in public). The CI database is built from a curated balance baseline
-- + whitelisted balance migrations only — it does NOT replay the production
-- REVOKE migrations from 2026-07-25 (Phase 1 / 2a / Option E / Phase 3),
-- because most of their targets don't exist on the curated CI schema.
--
-- Instead of maintaining a hand-written REVOKE list that duplicates prod
-- migrations (drifts constantly), this shim iterates the SAME predicate the
-- invariant test uses and revokes each match. Idempotent: revoke on an
-- already-revoked function is a no-op. Future SECDEF funcs added via new
-- balance migrations are covered automatically.
--
-- VAŽNO (2026-08-02): shim NE dira funkcije koje su donijele whitelistane
-- migracije (ci_meta.migration_funcs, vidi ci_snapshot_pre/post.sql). Prije
-- ove izmjene shim je revokirao baš sve, pa je secdef_anon_invariant.sql bio
-- zelen po definiciji i propustio je produkcijsku rupu iz koraka E
-- (review_project_expense, auto_reject_expired_pending_expenses izvršive anon-u).
-- Ako ci_meta.migration_funcs ne postoji (samostalno pokretanje harnessa),
-- shim se ponaša kao prije i čisti sve — tada invarijanta nije gate.
--
-- Runs on CI ONLY. Never applied to production.

-- Bez snimka (samostalno pokretanje) tretiraj skup migracijskih funkcija kao prazan.
CREATE SCHEMA IF NOT EXISTS ci_meta;
CREATE TABLE IF NOT EXISTS ci_meta.migration_funcs (sig text);

DO $shim$
DECLARE
  v_sig  text;
  v_count int := 0;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM ci_meta.migration_funcs m
        WHERE m.sig = p.oid::regprocedure::text
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', v_sig);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'secdef_anon_shim: revoked anon+PUBLIC EXECUTE on % function(s)', v_count;
END
$shim$;
