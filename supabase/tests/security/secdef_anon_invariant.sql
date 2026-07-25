-- Invariant: no callable SECURITY DEFINER function in `public` may be
-- executable by the `anon` role. Runs against the CI database built by
-- balance-sql-suite (curated baseline + whitelisted migrations).
--
-- Test-only allowlist: intentionally empty. As of 2026-07-25 no anon-
-- exposed SECDEF function is required. Add here ONLY functions that must
-- stay anon-callable in non-production (e.g. `e2e_reset_user` if ever
-- promoted to anon — currently it is not).
--
-- Failure mode: raises with the offending signatures so the CI step
-- exits non-zero (psql ON_ERROR_STOP=1).

DO $ci$
DECLARE
  v_leaked text;
  v_msg text := '';
  v_count int := 0;
BEGIN
  FOR v_leaked IN
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      -- ALLOWLIST (empty — see header):
      AND p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
          NOT IN ()  -- placeholder replaced below
    ORDER BY 1
  LOOP
    v_count := v_count + 1;
    v_msg := v_msg || E'\n  - ' || v_leaked;
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'SECDEF anon regression: % function(s) callable by anon:%',
      v_count, v_msg;
  END IF;

  RAISE NOTICE 'SECDEF anon invariant: PASS (0 leaks)';
END
$ci$;
