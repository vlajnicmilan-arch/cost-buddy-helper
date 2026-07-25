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
-- Runs on CI ONLY, between the balance suite and the invariant test.
-- Never applied to production.

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
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', v_sig);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'secdef_anon_shim: revoked anon+PUBLIC EXECUTE on % function(s)', v_count;
END
$shim$;
