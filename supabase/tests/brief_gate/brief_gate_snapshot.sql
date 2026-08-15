-- BRIEF-VRATA — RPC brief_gate_snapshot().
--
-- Ocekivanje:
--   * korisnik koji NIJE na popisu (app_settings.brief_gate_user_ids) => {"enabled": false}
--   * korisnik NA popisu => enabled:true + counts (racuni u dospijecu, dokumenti, za paznju)
--   * anon (auth.uid() IS NULL) => {"enabled": false}
--   * anon NEMA EXECUTE na funkciji
--
-- Pokretanje: psql -v ON_ERROR_STOP=1 -f brief_gate_snapshot.sql
-- Transakcija se na kraju rollbacka.

BEGIN;

DO $$
DECLARE
  uid uuid := '00000000-0000-0000-0000-0000000000b1';
  other uuid := '00000000-0000-0000-0000-0000000000b2';
  res jsonb;
  ok text := '';
BEGIN
  -- anon
  PERFORM set_config('request.jwt.claims', NULL, true);
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL anon enabled=%', res;
  END IF;
  ok := ok || 'anon_disabled;';

  -- korisnik izvan popisa
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other)::text, true);
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL non-allowlisted enabled=%', res;
  END IF;
  ok := ok || 'not_allowlisted_disabled;';

  -- korisnik na popisu
  INSERT INTO public.app_settings(key, value)
  VALUES ('brief_gate_user_ids', jsonb_build_array(uid::text))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL allowlisted enabled=%', res;
  END IF;
  IF res->'invoices'->>'count' IS NULL
     OR res->'documents'->>'count' IS NULL
     OR res->'attention'->>'count' IS NULL THEN
    RAISE EXCEPTION 'FAIL missing counts %', res;
  END IF;
  ok := ok || 'allowlisted_counts_ok;';

  -- anon nema EXECUTE
  IF has_function_privilege('anon', 'public.brief_gate_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon has EXECUTE';
  END IF;
  ok := ok || 'anon_no_execute;';

  RAISE NOTICE 'brief_gate_snapshot OK: %', ok;
END $$;

ROLLBACK;
