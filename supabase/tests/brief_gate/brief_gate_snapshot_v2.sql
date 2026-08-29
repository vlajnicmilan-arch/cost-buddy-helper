-- BRIEF-VRATA — RPC brief_gate_snapshot_v2(), sloj dopuštenih korisnika.
--
-- Ovo je scenarij za funkciju koju aplikacija STVARNO zove
-- (src/hooks/useBriefSnapshot.ts → .rpc('brief_gate_snapshot_v2')).
--
-- Pravilo popisa (app_settings.key='brief_gate_user_ids', jsonb array):
--   * '["*"]'            => SVI prijavljeni korisnici dobivaju enabled=true
--   * '["<uid>", ...]'   => samo navedeni
--   * '[]'               => nitko
--   * nema retka         => nitko
--   * auth.uid() IS NULL => uvijek enabled=false
--   * anon/PUBLIC nemaju EXECUTE
--
-- Pokretanje: psql -v ON_ERROR_STOP=1 -f brief_gate_snapshot_v2.sql
-- Transakcija se na kraju rollbacka.

BEGIN;

DO $$
DECLARE
  uid uuid := '00000000-0000-0000-0000-0000000000c1';
  other uuid := '00000000-0000-0000-0000-0000000000c2';
  res jsonb;
  ok text := '';
BEGIN
  -- neprijavljen
  PERFORM set_config('request.jwt.claims', NULL, true);
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL anon enabled=%', res;
  END IF;
  ok := ok || 'anon_disabled;';

  -- nema retka u app_settings => nitko
  DELETE FROM public.app_settings WHERE key = 'brief_gate_user_ids';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL no-row enabled=%', res;
  END IF;
  ok := ok || 'no_row_disabled;';

  -- prazan popis => nitko
  INSERT INTO public.app_settings(key, value)
  VALUES ('brief_gate_user_ids', '[]'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL empty-list enabled=%', res;
  END IF;
  ok := ok || 'empty_list_disabled;';

  -- popis s pojedinačnim identifikatorom: taj da, drugi ne
  UPDATE public.app_settings SET value = jsonb_build_array(uid::text)
   WHERE key = 'brief_gate_user_ids';
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL allowlisted enabled=%', res;
  END IF;
  IF res->'categories'->'uncertainty'->>'count' IS NULL
     OR res->'categories'->'due'->>'count' IS NULL
     OR res->'categories'->'mail'->>'count' IS NULL THEN
    RAISE EXCEPTION 'FAIL missing counts %', res;
  END IF;
  ok := ok || 'allowlisted_counts_ok;';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', other)::text, true);
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL other-user enabled=%', res;
  END IF;
  ok := ok || 'other_user_disabled;';

  -- '["*"]' => svi prijavljeni, iako nisu navedeni poimence
  UPDATE public.app_settings SET value = '["*"]'::jsonb
   WHERE key = 'brief_gate_user_ids';
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL star other-user enabled=%', res;
  END IF;
  ok := ok || 'star_opens_for_all;';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL star uid enabled=%', res;
  END IF;
  ok := ok || 'star_uid_ok;';

  -- '*' i dalje ne otvara neprijavljenima
  PERFORM set_config('request.jwt.claims', NULL, true);
  res := public.brief_gate_snapshot_v2();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL star anon enabled=%', res;
  END IF;
  ok := ok || 'star_anon_still_disabled;';

  -- anon nema EXECUTE
  IF has_function_privilege('anon', 'public.brief_gate_snapshot_v2()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon has EXECUTE';
  END IF;
  -- PUBLIC nema EXECUTE
  IF has_function_privilege('public', 'public.brief_gate_snapshot_v2()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL PUBLIC has EXECUTE';
  END IF;
  ok := ok || 'anon_public_no_execute;';

  RAISE NOTICE 'brief_gate_snapshot_v2 OK: %', ok;
END $$;

ROLLBACK;
