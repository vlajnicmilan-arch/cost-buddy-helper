-- BRIEF-VRATA — RPC brief_gate_snapshot(), sloj dopuštenih korisnika.
--
-- Pravilo popisa (app_settings.key='brief_gate_user_ids', jsonb array):
--   * '["*"]'            => SVI prijavljeni korisnici dobivaju enabled=true
--   * '["<uid>", ...]'   => samo navedeni
--   * '[]'               => nitko
--   * nema retka         => nitko
--   * auth.uid() IS NULL => uvijek enabled=false
--   * anon/PUBLIC nemaju EXECUTE
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

  -- nema retka u app_settings => nitko
  DELETE FROM public.app_settings WHERE key = 'brief_gate_user_ids';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL no-row enabled=%', res;
  END IF;
  ok := ok || 'no_row_disabled;';

  -- prazan popis => nitko
  INSERT INTO public.app_settings(key, value)
  VALUES ('brief_gate_user_ids', '[]'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL empty-list enabled=%', res;
  END IF;
  ok := ok || 'empty_list_disabled;';

  -- popis s pojedinačnim identifikatorom: taj da, drugi ne
  UPDATE public.app_settings SET value = jsonb_build_array(uid::text)
   WHERE key = 'brief_gate_user_ids';
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

  PERFORM set_config('request.jwt.claims', json_build_object('sub', other)::text, true);
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL other-user enabled=%', res;
  END IF;
  ok := ok || 'other_user_disabled;';

  -- '["*"]' => svi prijavljeni, iako nisu navedeni poimence
  UPDATE public.app_settings SET value = '["*"]'::jsonb
   WHERE key = 'brief_gate_user_ids';
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL star other-user enabled=%', res;
  END IF;
  ok := ok || 'star_opens_for_all;';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL star uid enabled=%', res;
  END IF;
  ok := ok || 'star_uid_ok;';

  -- '*' i dalje ne otvara neprijavljenima
  PERFORM set_config('request.jwt.claims', NULL, true);
  res := public.brief_gate_snapshot();
  IF (res->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL star anon enabled=%', res;
  END IF;
  ok := ok || 'star_anon_still_disabled;';

  -- anon nema EXECUTE
  IF has_function_privilege('anon', 'public.brief_gate_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon has EXECUTE';
  END IF;
  -- PUBLIC nema EXECUTE (proacl bez zapisa = zadano; provjera eksplicitno)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'brief_gate_snapshot'
      AND (p.proacl IS NULL OR p.proacl::text LIKE '%=%/postgres%@%')
      AND EXISTS (
        SELECT 1 FROM unnest(p.proacl) a
        WHERE split_part(a::text, '=', 1) = ''
      )
  ) THEN
    RAISE EXCEPTION 'FAIL PUBLIC has EXECUTE';
  END IF;
  ok := ok || 'anon_public_no_execute;';

  RAISE NOTICE 'brief_gate_snapshot OK: %', ok;
END $$;

ROLLBACK;
