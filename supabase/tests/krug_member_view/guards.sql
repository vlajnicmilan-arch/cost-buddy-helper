-- krug_member_view čuvari V1–V8. Svaki DO blok pada s 'FAIL Vx'.
\set ON_ERROR_STOP on

-- Broj redaka ledgera koje korisnik vidi kroz RLS (kao realtime: authenticated + claims).
CREATE OR REPLACE FUNCTION public.kmv_ledger_seen(u text) RETURNS SETOF uuid LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  RETURN QUERY SELECT id FROM public.krug_settlement_ledger ORDER BY id;
  RESET ROLE;
END $$;
GRANT EXECUTE ON FUNCTION public.kmv_ledger_seen(text) TO authenticated;

-- V1 obični član vidi samo svoje retke; tuđi A↔B i E→A skriveni
DO $$ DECLARE ids uuid[]; BEGIN
  ids := ARRAY(SELECT public.kmv_ledger_seen('c0000000-0000-0000-0000-00000000000c'));
  IF ids IS DISTINCT FROM ARRAY['1e000000-0000-0000-0000-000000000002']::uuid[] THEN
    RAISE EXCEPTION 'FAIL V1 C vidi %', ids; END IF;
  ids := ARRAY(SELECT public.kmv_ledger_seen('d0000000-0000-0000-0000-00000000000d'));
  IF cardinality(ids) <> 0 THEN RAISE EXCEPTION 'FAIL V1 D vidi %', ids; END IF;
  RAISE NOTICE 'PASS V1 obični član: samo vlastiti redak (C→A), A↔B i E→A skriveni; D bez strane vidi 0';
END $$;

-- V2 bivši član i član obrisanog Kruga vide 0; preview ih odbija
DO $$ DECLARE ids uuid[]; BEGIN
  ids := ARRAY(SELECT public.kmv_ledger_seen('e0000000-0000-0000-0000-00000000000e'));
  IF cardinality(ids) <> 0 THEN RAISE EXCEPTION 'FAIL V2 bivši član vidi %', ids; END IF;
  IF '1e000000-0000-0000-0000-000000000004'::uuid IN (SELECT public.kmv_ledger_seen('c0000000-0000-0000-0000-00000000000c')) THEN
    RAISE EXCEPTION 'FAIL V2 C vidi redak obrisanog Kruga'; END IF;
  BEGIN
    PERFORM public.kmv_prev('e0000000-0000-0000-0000-00000000000e');
    RAISE EXCEPTION 'FAIL V2 bivši član dobio preview';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.kmv_prev('c0000000-0000-0000-0000-00000000000c', 'EUR', '{}', 'c2000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL V2 obrisani Krug dao preview';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS V2 bivši član i obrisani Krug: 0 redaka, preview 42501';
END $$;

-- V3 punopravni i vlasnik: odgovor identičan kao prije (cijeli jsonb)
DO $$ DECLARE r record; n int := 0; BEGIN
  FOR r IN SELECT * FROM public.kmv_before LOOP
    IF public.kmv_prev(r.u, r.cur, r.rates) IS DISTINCT FROM r.j THEN
      RAISE EXCEPTION 'FAIL V3 % % %: before=% after=%', r.u, r.cur, r.rates, r.j, public.kmv_prev(r.u, r.cur, r.rates);
    END IF;
    n := n + 1;
  END LOOP;
  IF n <> 6 THEN RAISE EXCEPTION 'FAIL V3 snimki %', n; END IF;
  RAISE NOTICE 'PASS V3 vlasnik i punopravni: 6/6 odgovora identično kao prije';
END $$;

-- V4 obični član: samo njegov redak, izravni parovi, bez tuđih id-eva i zbirnih polja
DO $$ DECLARE j jsonb; ids text[]; exp jsonb; BEGIN
  j := public.kmv_prev('c0000000-0000-0000-0000-00000000000c', 'EUR', '{"USD":1.1}');
  RAISE NOTICE 'C preview: %', j;
  IF jsonb_array_length(j->'members') <> 1 OR j->'members'->0->>'user_id' <> 'c0000000-0000-0000-0000-00000000000c' THEN
    RAISE EXCEPTION 'FAIL V4 members %', j->'members'; END IF;
  IF j->'members'->0 <> '{"user_id":"c0000000-0000-0000-0000-00000000000c","paid":20,"owed":40,"net":-10}'::jsonb THEN
    RAISE EXCEPTION 'FAIL V4 moj redak %', j->'members'->0; END IF;
  exp := '[{"from_user":"c0000000-0000-0000-0000-00000000000c","to_user":"a0000000-0000-0000-0000-00000000000a","amount":20,"currency":"EUR"},
           {"from_user":"b0000000-0000-0000-0000-00000000000b","to_user":"c0000000-0000-0000-0000-00000000000c","amount":10,"currency":"EUR"}]';
  IF j->'transfers' <> exp THEN RAISE EXCEPTION 'FAIL V4 transfers %', j->'transfers'; END IF;
  IF jsonb_array_length(j->'settled_transfers') <> 1
     OR j->'settled_transfers'->0->>'ledger_id' <> '1e000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'FAIL V4 settled %', j->'settled_transfers'; END IF;
  -- svaki transfer ima C kao stranu
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(j->'transfers' || j->'settled_transfers') t
             WHERE 'c0000000-0000-0000-0000-00000000000c' NOT IN (t->>'from_user', t->>'to_user')) THEN
    RAISE EXCEPTION 'FAIL V4 tuđi par'; END IF;
  -- nema tuđih id-eva osim izravnih partnera (A, B)
  ids := ARRAY(SELECT DISTINCT m[1] FROM regexp_matches(j::text, '([0-9a-f]{8}-0000-0000-0000-0000000000[0-9a-f]{2})', 'g') m
               WHERE m[1] NOT LIKE 'c1000000%' AND m[1] NOT LIKE '1e000000%' ORDER BY 1);
  IF ids <> ARRAY['a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000c'] THEN
    RAISE EXCEPTION 'FAIL V4 id-evi %', ids; END IF;
  IF j->'flags' ? 'missing_income_data' OR j->'flags' ? 'manual_mode_fallback_equal' OR j->'flags' ? 'no_members' THEN
    RAISE EXCEPTION 'FAIL V4 zastavice %', j->'flags'; END IF;
  -- USD trošak A/B nije moj: nema miješane valute ni tečaja
  IF (j->'flags'->>'mixed_currencies')::boolean OR j->'fx'->'rates_used' <> '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL V4 tuđa valuta %', j->'fx'; END IF;
  -- zbroj parova = moj neto
  IF (SELECT sum(CASE WHEN t->>'from_user' LIKE 'c0%' THEN -(t->>'amount')::numeric ELSE (t->>'amount')::numeric END)
        FROM jsonb_array_elements(j->'transfers') t) <> (j->'members'->0->>'net')::numeric THEN
    RAISE EXCEPTION 'FAIL V4 zbroj parova ≠ neto'; END IF;
  RAISE NOTICE 'PASS V4 obični član: samo svoj redak, izravni parovi C→A 20 i B→C 10, bez tuđih id-eva, zbirova i zastavica';
END $$;

-- V5 obični član bez ijednog udjela: prazan odgovor, bez tuđih id-eva
DO $$ DECLARE j jsonb; BEGIN
  j := public.kmv_prev('d0000000-0000-0000-0000-00000000000d');
  IF j->'members' <> '[{"user_id":"d0000000-0000-0000-0000-00000000000d","paid":0,"owed":0,"net":0}]'::jsonb
     OR j->'transfers' <> '[]' OR j->'settled_transfers' <> '[]' THEN
    RAISE EXCEPTION 'FAIL V5 %', j; END IF;
  RAISE NOTICE 'PASS V5 obični član bez udjela: prazno';
END $$;

-- V6 dva različita stanja tuđih troškova → identičan odgovor običnom članu
DO $$ DECLARE a jsonb; b jsonb; d1 jsonb; d2 jsonb; BEGIN
  a := public.kmv_prev('c0000000-0000-0000-0000-00000000000c', 'EUR', '{"USD":1.1}');
  d1 := public.kmv_prev('d0000000-0000-0000-0000-00000000000d', 'EUR', '{"USD":1.1}');
  INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
   ('e1000000-0000-0000-0000-0000000000f1','b0000000-0000-0000-0000-00000000000b','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',999,'EUR'),
   ('e1000000-0000-0000-0000-0000000000f2','a0000000-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',77,'GBP');
  INSERT INTO public.krug_expense_split_override(id,expense_id,krug_id,proposed_by,status,activated_at) VALUES
   ('0b000000-0000-0000-0000-0000000000f2','e1000000-0000-0000-0000-0000000000f2','c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','potvrdjena',now());
  INSERT INTO public.krug_expense_split_share(override_id,user_id,share_percent) VALUES
   ('0b000000-0000-0000-0000-0000000000f2','a0000000-0000-0000-0000-00000000000a',10),
   ('0b000000-0000-0000-0000-0000000000f2','b0000000-0000-0000-0000-00000000000b',90);
  INSERT INTO public.krug_settlement_ledger(krug_id,from_user,to_user,amount,currency,marked_at) VALUES
   ('c1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',123,'EUR',now());
  DELETE FROM public.krug_settlement_ledger WHERE id='1e000000-0000-0000-0000-000000000001';
  b := public.kmv_prev('c0000000-0000-0000-0000-00000000000c', 'EUR', '{"USD":1.1}');
  d2 := public.kmv_prev('d0000000-0000-0000-0000-00000000000d', 'EUR', '{"USD":1.1}');
  IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'FAIL V6 C: % vs %', a, b; END IF;
  IF d1 IS DISTINCT FROM d2 THEN RAISE EXCEPTION 'FAIL V6 D: % vs %', d1, d2; END IF;
  -- punopravni to vidi (kontrola da se stanje stvarno promijenilo)
  IF public.kmv_prev('a0000000-0000-0000-0000-00000000000a', 'EUR', '{"USD":1.1}')
     = (SELECT j FROM public.kmv_before WHERE u LIKE 'a0%' AND cur='EUR' AND rates='{"USD":1.1}') THEN
    RAISE EXCEPTION 'FAIL V6 kontrola: stanje se nije promijenilo'; END IF;
  RAISE NOTICE 'PASS V6 tuđi troškovi i podmirenja promijenjeni: odgovor C i D bit-identičan';
END $$;

-- V7 prava: isti potpis i prava na previewu; pomoćnik nije dostupan klijentu
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname='krug_settlement_preview') <> 1 THEN RAISE EXCEPTION 'FAIL V7 overload'; END IF;
  IF has_function_privilege('anon','public.krug_settlement_preview(uuid,date,date,text,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.krug_settlement_preview(uuid,date,date,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL V7 preview prava'; END IF;
  IF has_function_privilege('anon','public.krug_settlement_preview_own_party(uuid,uuid,date,date,text,jsonb,public.krug_split_mode,text,boolean,timestamptz)','EXECUTE')
     OR has_function_privilege('authenticated','public.krug_settlement_preview_own_party(uuid,uuid,date,date,text,jsonb,public.krug_split_mode,text,boolean,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL V7 pomoćnik dostupan klijentu'; END IF;
  RAISE NOTICE 'PASS V7 potpis i prava nepromijenjeni; pomoćnik zatvoren za anon/authenticated';
END $$;

-- V8 realtime/RLS: punopravni i dalje vidi sve retke svog Kruga
DO $$ DECLARE n int; BEGIN
  n := (SELECT count(*) FROM public.kmv_ledger_seen('b0000000-0000-0000-0000-00000000000b'));
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL V8 B vidi %', n; END IF;
  RAISE NOTICE 'PASS V8 punopravni vidi sve retke Kruga (3)';
END $$;
