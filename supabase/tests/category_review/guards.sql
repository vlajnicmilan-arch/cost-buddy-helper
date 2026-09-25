-- SQL čuvari Pregleda kategorija. Svaki blok zaseban; ispis PASS C.. / FAIL C..
\set ON_ERROR_STOP 0
CREATE TEMP TABLE snap AS
  SELECT (SELECT sum(balance) FROM public.custom_payment_sources) AS bal,
         (SELECT md5(string_agg(id::text||type||amount::text||coalesce(payment_source,'')||date::text||coalesce(income_source_id::text,''), ',' ORDER BY id)) FROM public.expenses) AS core;
DO $$ BEGIN RAISE NOTICE 'balance sum before = %', (SELECT bal FROM snap); END $$;

-- C1: vlasnik mijenja category → list; upisan category_corrections; vraća changed=1
DO $$ DECLARE r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  r := public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000001","category":"groceries"}]'::jsonb,
                                     '99999999-0000-0000-0000-000000000001');
  IF (r->>'changed')::int = 1
     AND (SELECT category FROM expenses WHERE id='e0000000-0000-0000-0000-000000000001') = 'groceries'
     AND EXISTS (SELECT 1 FROM category_corrections WHERE expense_id='e0000000-0000-0000-0000-000000000001'
                 AND original_category='food' AND corrected_category='groceries' AND merchant_name='Konzum'
                 AND original_origin='category_review')
  THEN RAISE NOTICE 'PASS C1 apply category + correction row';
  ELSE RAISE NOTICE 'FAIL C1 %', r; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C1 %', SQLERRM; END $$;

-- C2: idempotentno — isti client_request_id ne upisuje drugi red
DO $$ DECLARE r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  r := public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000001","category":"groceries"}]'::jsonb,
                                     '99999999-0000-0000-0000-000000000001');
  IF (r->>'changed')::int = 0 AND (r->>'already')::int = 1
     AND (SELECT count(*) FROM category_corrections WHERE expense_id='e0000000-0000-0000-0000-000000000001') = 1
  THEN RAISE NOTICE 'PASS C2 idempotent'; ELSE RAISE NOTICE 'FAIL C2 %', r; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C2 %', SQLERRM; END $$;

-- C3: movement_kind + tags; ispada iz potrošnje (movement_kind ne-NULL)
DO $$ DECLARE r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  r := public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000002","movement_kind":"own_transfer","tags":["luxury"]}]'::jsonb,
                                     '99999999-0000-0000-0000-000000000002');
  IF (r->>'changed')::int = 1 AND (SELECT movement_kind FROM expenses WHERE id='e0000000-0000-0000-0000-000000000002')='own_transfer'
     AND (SELECT tags FROM expenses WHERE id='e0000000-0000-0000-0000-000000000002') = ARRAY['luxury']
     AND (SELECT category FROM expenses WHERE id='e0000000-0000-0000-0000-000000000002') = 'other'
  THEN RAISE NOTICE 'PASS C3 movement_kind + tags'; ELSE RAISE NOTICE 'FAIL C3 %', r; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C3 %', SQLERRM; END $$;

-- C4: tuđi redak odbijen
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  PERFORM public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000004","category":"groceries"}]'::jsonb, gen_random_uuid());
  RAISE NOTICE 'FAIL C4 foreign row accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'not_allowed' AND (SELECT category FROM expenses WHERE id='e0000000-0000-0000-0000-000000000004')='other'
  THEN RAISE NOTICE 'PASS C4 foreign row rejected'; ELSE RAISE NOTICE 'FAIL C4 %', SQLERRM; END IF; END $$;

-- C5: član dijeljenog izvora s pravom pisanja smije
DO $$ DECLARE r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003', false);
  r := public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000005","category":"salary"}]'::jsonb, gen_random_uuid());
  IF (r->>'changed')::int = 1 THEN RAISE NOTICE 'PASS C5 shared writer allowed'; ELSE RAISE NOTICE 'FAIL C5 %', r; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C5 %', SQLERRM; END $$;

-- C6: „Pokrivanje…" — ni iz nje ni u nju
DO $$ DECLARE ok int := 0; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  BEGIN PERFORM public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000003","category":"groceries"}]'::jsonb, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='exempt_category' THEN ok := ok+1; END IF; END;
  BEGIN PERFORM public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000001","category":"ab61e917-645c-465c-94f4-aec2645062e9"}]'::jsonb, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='invalid_category' THEN ok := ok+1; END IF; END;
  IF ok = 2 AND (SELECT category FROM expenses WHERE id='e0000000-0000-0000-0000-000000000003')='ab61e917-645c-465c-94f4-aec2645062e9'
  THEN RAISE NOTICE 'PASS C6 exempt category untouched'; ELSE RAISE NOTICE 'FAIL C6 ok=%', ok; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C6 %', SQLERRM; END $$;

-- C7: nevaljana kategorija (tuđa korisnička, nepostojeći ključ) i nevaljan movement_kind odbijeni
DO $$ DECLARE ok int := 0; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  BEGIN PERFORM public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000001","category":"eeeeeeee-0000-0000-0000-000000000005"}]'::jsonb, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='invalid_category' THEN ok := ok+1; END IF; END;
  BEGIN PERFORM public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000001","category":"food"}]'::jsonb, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='invalid_category' THEN ok := ok+1; END IF; END;
  BEGIN PERFORM public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000001","movement_kind":"xx"}]'::jsonb, gen_random_uuid());
  EXCEPTION WHEN check_violation THEN ok := ok+1; END;
  IF ok = 3 THEN RAISE NOTICE 'PASS C7 invalid targets rejected'; ELSE RAISE NOTICE 'FAIL C7 ok=%', ok; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C7 %', SQLERRM; END $$;

-- C8: korisnička kategorija vlasnika dopuštena
DO $$ DECLARE r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  r := public.category_review_apply('[{"expense_id":"e0000000-0000-0000-0000-000000000001","category":"dddddddd-0000-0000-0000-000000000004"}]'::jsonb,
                                     '99999999-0000-0000-0000-000000000008');
  IF (r->>'changed')::int = 1 THEN RAISE NOTICE 'PASS C8 own custom category'; ELSE RAISE NOTICE 'FAIL C8 %', r; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C8 %', SQLERRM; END $$;

-- C9: poništavanje vraća točno staro (zadnje → groceries; staro changed_since ne gazi)
DO $$ DECLARE r jsonb; v_last uuid; v_first uuid; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  SELECT id INTO v_first FROM category_corrections WHERE client_request_id='99999999-0000-0000-0000-000000000001';
  SELECT id INTO v_last  FROM category_corrections WHERE client_request_id='99999999-0000-0000-0000-000000000008';
  -- staro poništenje dok je zapis već promijenjen → preskočeno
  r := public.category_review_revert(ARRAY[v_first]);
  IF (r->>'reverted')::int <> 0 OR r->'skipped'->0->>'reason' <> 'changed_since' THEN RAISE NOTICE 'FAIL C9a %', r; RETURN; END IF;
  r := public.category_review_revert(ARRAY[v_last]);
  IF (r->>'reverted')::int <> 1 OR (SELECT category FROM expenses WHERE id='e0000000-0000-0000-0000-000000000001') <> 'groceries' THEN RAISE NOTICE 'FAIL C9b %', r; RETURN; END IF;
  r := public.category_review_revert(ARRAY[v_first]);
  IF (r->>'reverted')::int = 1 AND (SELECT category FROM expenses WHERE id='e0000000-0000-0000-0000-000000000001') = 'food'
     AND (SELECT reverted_at IS NOT NULL FROM category_corrections WHERE id=v_first)
  THEN RAISE NOTICE 'PASS C9 revert restores exact old value'; ELSE RAISE NOTICE 'FAIL C9 %', r; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C9 %', SQLERRM; END $$;

-- C10: poništavanje movement_kind/tags
DO $$ DECLARE r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
  r := public.category_review_revert(ARRAY(SELECT id FROM category_corrections WHERE client_request_id='99999999-0000-0000-0000-000000000002'));
  IF (r->>'reverted')::int = 1 AND (SELECT movement_kind IS NULL AND tags = '{}' FROM expenses WHERE id='e0000000-0000-0000-0000-000000000002')
  THEN RAISE NOTICE 'PASS C10 revert movement_kind + tags'; ELSE RAISE NOTICE 'FAIL C10 %', r; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C10 %', SQLERRM; END $$;

-- C11: tuđe poništavanje odbijeno
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', false);
  PERFORM public.category_review_revert(ARRAY(SELECT id FROM category_corrections LIMIT 1));
  RAISE NOTICE 'FAIL C11 foreign revert accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM='not_allowed' THEN RAISE NOTICE 'PASS C11 foreign revert rejected'; ELSE RAISE NOTICE 'FAIL C11 %', SQLERRM; END IF; END $$;

-- C12: type/amount/izvor/datum i zbroj salda nepromijenjeni
DO $$ BEGIN
  IF (SELECT sum(balance) FROM public.custom_payment_sources) = (SELECT bal FROM snap)
     AND (SELECT md5(string_agg(id::text||type||amount::text||coalesce(payment_source,'')||date::text||coalesce(income_source_id::text,''), ',' ORDER BY id)) FROM public.expenses) = (SELECT core FROM snap)
  THEN RAISE NOTICE 'PASS C12 balances and type/amount/source/date unchanged (sum=%)', (SELECT bal FROM snap);
  ELSE RAISE NOTICE 'FAIL C12'; END IF;
END $$;

-- C13: prava pristupa i jedan oblik
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname='category_review_apply') = 1
     AND (SELECT count(*) FROM pg_proc WHERE proname='category_review_revert') = 1
     AND NOT has_function_privilege('anon','public.category_review_apply(jsonb,uuid)','EXECUTE')
     AND NOT has_function_privilege('anon','public.category_review_revert(uuid[])','EXECUTE')
     AND has_function_privilege('authenticated','public.category_review_apply(jsonb,uuid)','EXECUTE')
     AND (SELECT prosecdef FROM pg_proc WHERE proname='category_review_apply')
  THEN RAISE NOTICE 'PASS C13 one form, secdef, no anon'; ELSE RAISE NOTICE 'FAIL C13'; END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FAIL C13 %', SQLERRM; END $$;
