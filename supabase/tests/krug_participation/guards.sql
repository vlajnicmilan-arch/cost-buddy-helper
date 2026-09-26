-- krug_participation čuvari P1–P10. Svaki DO blok pada s 'FAIL Px'.
\set ON_ERROR_STOP on
-- A=a…a vlasnik, B=b…b punopravni, C=c…c i D=d…d obični, E=e…e bivši, N=9…9 izvan Kruga.

CREATE OR REPLACE FUNCTION public.kp_sum_net(j jsonb) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(sum((m->>'net')::numeric),0) FROM jsonb_array_elements(j->'members') m $$;
CREATE OR REPLACE FUNCTION public.kp_member(j jsonb, u text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT m FROM jsonb_array_elements(j->'members') m WHERE m->>'user_id' = u $$;
CREATE OR REPLACE FUNCTION public.kp_rls(u text, q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
  PERFORM set_config('request.jwt.claim.sub', u, true);
  SET LOCAL ROLE authenticated;
  EXECUTE q INTO n;
  RESET ROLE;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.kp_rls(text,text) TO authenticated;

-- P1 bez prijedloga: punopravni pogledi bit-identični prije/poslije (2 stanja × EUR/USD × tečaj)
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.kp_before b JOIN public.kp_full_views(1) a USING (st,u,cur,rates) WHERE a.j IS DISTINCT FROM b.j;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL P1 stanje 1: % razlika', n; END IF;
  PERFORM public.kp_state2(true);
  SELECT count(*) INTO n FROM public.kp_before b JOIN public.kp_full_views(2) a USING (st,u,cur,rates) WHERE a.j IS DISTINCT FROM b.j;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL P1 stanje 2: % razlika', n; END IF;
  PERFORM public.kp_state2(false);
  IF (SELECT count(*) FROM public.kp_before) <> 12 THEN RAISE EXCEPTION 'FAIL P1 snimka nepotpuna'; END IF;
  RAISE NOTICE 'PASS P1 bez prijedloga s običnim članom: 12/12 punopravnih odgovora identično (2 stanja, EUR/USD, s tečajem i bez)';
END $$;

-- P2 bez prijedloga obični član nema duga (ni kad sam plati trošak)
DO $$ DECLARE j jsonb; BEGIN
  j := public.kp_prev('c0000000-0000-0000-0000-00000000000c');
  IF jsonb_array_length(j->'transfers') <> 0 OR (j->'members'->0->>'net')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL P2 C ima dug bez prijedloga: %', j; END IF;
  IF public.kp_member(public.kp_prev('a0000000-0000-0000-0000-00000000000a'), 'c0000000-0000-0000-0000-00000000000c') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL P2 C u punopravnom pogledu bez prijedloga'; END IF;
  -- Obični platitelj bez prijedloga ostaje izvan izračuna kao danas; dalje ga ne trebamo.
  UPDATE public.expenses SET deleted_at = now() WHERE id = 'e1000000-0000-0000-0000-000000000003';
  RAISE NOTICE 'PASS P2 bez prijedloga obični član nema duga i nije u punopravnom pogledu';
END $$;

-- P3 prijedlog s bivšim članom, nečlanom ili bez svih punopravnih se odbija
DO $$ BEGIN
  PERFORM public.kp_as('a0000000-0000-0000-0000-00000000000a');
  BEGIN
    PERFORM public.krug_override_propose('e1000000-0000-0000-0000-000000000001',
      '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":25},{"user_id":"e0000000-0000-0000-0000-00000000000e","share_percent":25}]');
    RAISE EXCEPTION 'FAIL P3 bivši član prihvaćen';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'shares_user_not_member' THEN RAISE EXCEPTION 'FAIL P3 bivši: %', SQLERRM; END IF; END;
  BEGIN
    PERFORM public.krug_override_propose('e1000000-0000-0000-0000-000000000001',
      '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":25},{"user_id":"99999999-9999-9999-9999-999999999999","share_percent":25}]');
    RAISE EXCEPTION 'FAIL P3 nečlan prihvaćen';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'shares_user_not_member' THEN RAISE EXCEPTION 'FAIL P3 nečlan: %', SQLERRM; END IF; END;
  BEGIN
    PERFORM public.krug_override_propose('e1000000-0000-0000-0000-000000000001',
      '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"c0000000-0000-0000-0000-00000000000c","share_percent":50}]');
    RAISE EXCEPTION 'FAIL P3 bez B prihvaćen';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT IN ('shares_users_mismatch','shares_must_cover_all_full_members') THEN RAISE EXCEPTION 'FAIL P3 bez B: %', SQLERRM; END IF; END;
  PERFORM public.kp_as('c0000000-0000-0000-0000-00000000000c');
  BEGIN
    PERFORM public.krug_override_propose('e1000000-0000-0000-0000-000000000001',
      '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":50}]');
    RAISE EXCEPTION 'FAIL P3 obični član predložio';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'not_full_member' THEN RAISE EXCEPTION 'FAIL P3 predlagatelj: %', SQLERRM; END IF; END;
  IF EXISTS (SELECT 1 FROM public.krug_expense_split_override) THEN RAISE EXCEPTION 'FAIL P3 ostao prijedlog'; END IF;
  RAISE NOTICE 'PASS P3 bivši član i nečlan → shares_user_not_member; bez punopravnog → odbijeno; obični ne predlaže';
END $$;

-- P4 obični uključen: dug tek nakon njegove potvrde; obavijest mu ide kroz outbox
DO $$ DECLARE r jsonb; ov uuid; j jsonb; BEGIN
  PERFORM public.kp_as('a0000000-0000-0000-0000-00000000000a');
  r := public.krug_override_propose('e1000000-0000-0000-0000-000000000001',
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":25},{"user_id":"c0000000-0000-0000-0000-00000000000c","share_percent":25}]');
  ov := (r->>'id')::uuid;
  IF (r->>'awaiting_confirmations')::int <> 2 OR (r->>'auto_activated')::boolean THEN RAISE EXCEPTION 'FAIL P4 odgovor %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notify_log WHERE event='krug_override_proposed'
                  AND recipients @> ARRAY['b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000c']::uuid[]) THEN
    RAISE EXCEPTION 'FAIL P4 C nije primatelj obavijesti'; END IF;
  PERFORM public.kp_as('b0000000-0000-0000-0000-00000000000b');
  r := public.krug_override_confirm(ov);
  IF (r->>'activated')::boolean THEN RAISE EXCEPTION 'FAIL P4 aktivirano bez C'; END IF;
  j := public.kp_prev('c0000000-0000-0000-0000-00000000000c');
  IF jsonb_array_length(j->'transfers') <> 0 THEN RAISE EXCEPTION 'FAIL P4 dug prije potvrde: %', j; END IF;
  PERFORM public.kp_as('d0000000-0000-0000-0000-00000000000d');
  BEGIN PERFORM public.krug_override_confirm(ov); RAISE EXCEPTION 'FAIL P4 D potvrdio';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'not_full_member' THEN RAISE EXCEPTION 'FAIL P4 D: %', SQLERRM; END IF; END;
  PERFORM public.kp_as('c0000000-0000-0000-0000-00000000000c');
  r := public.krug_override_confirm(ov);
  IF NOT (r->>'activated')::boolean THEN RAISE EXCEPTION 'FAIL P4 nije aktivirano: %', r; END IF;
  j := public.kp_prev('c0000000-0000-0000-0000-00000000000c');
  IF j->'transfers' <> jsonb_build_array(jsonb_build_object('from_user','c0000000-0000-0000-0000-00000000000c',
       'to_user','a0000000-0000-0000-0000-00000000000a','amount',10.00,'currency','EUR')) THEN
    RAISE EXCEPTION 'FAIL P4 C transfers %', j->'transfers'; END IF;
  j := public.kp_prev('a0000000-0000-0000-0000-00000000000a');
  IF (public.kp_member(j,'c0000000-0000-0000-0000-00000000000c')->>'owed')::numeric <> 10 THEN RAISE EXCEPTION 'FAIL P4 C u punopravnom %', j; END IF;
  IF abs(public.kp_sum_net(j)) > 0.01 THEN RAISE EXCEPTION 'FAIL P4 neravnoteža %', public.kp_sum_net(j); END IF;
  RAISE NOTICE 'PASS P4 C uključen: nakon B još na čekanju (C bez duga); nakon C aktivno, C duguje A 10, punopravni zbroj neto = 0; D ne potvrđuje';
END $$;

-- P5 obični odbije → ništa se ne mijenja
DO $$ DECLARE r jsonb; ov uuid; before jsonb; BEGIN
  INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
   ('e1000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',20,'EUR');
  before := public.kp_prev('a0000000-0000-0000-0000-00000000000a');
  PERFORM public.kp_as('a0000000-0000-0000-0000-00000000000a');
  r := public.krug_override_propose('e1000000-0000-0000-0000-000000000004',
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":25},{"user_id":"d0000000-0000-0000-0000-00000000000d","share_percent":25}]');
  ov := (r->>'id')::uuid;
  PERFORM public.kp_as('b0000000-0000-0000-0000-00000000000b');
  PERFORM public.krug_override_confirm(ov);
  PERFORM public.kp_as('d0000000-0000-0000-0000-00000000000d');
  PERFORM public.krug_override_reject(ov, 'ne');
  IF (SELECT status FROM public.krug_expense_split_override WHERE id=ov) <> 'odbijena' THEN RAISE EXCEPTION 'FAIL P5 status'; END IF;
  IF public.kp_prev('a0000000-0000-0000-0000-00000000000a') IS DISTINCT FROM before THEN RAISE EXCEPTION 'FAIL P5 punopravni se promijenio'; END IF;
  IF jsonb_array_length(public.kp_prev('d0000000-0000-0000-0000-00000000000d')->'transfers') <> 0 THEN RAISE EXCEPTION 'FAIL P5 D ima dug'; END IF;
  RAISE NOTICE 'PASS P5 D odbio: prijedlog odbijen, punopravni pogled identičan, D bez duga';
END $$;

-- P6 obični platitelj u prijedlogu: zbrojevi u ravnoteži; "Dijeli samo X" s običnim
DO $$ DECLARE r jsonb; ov uuid; j jsonb; BEGIN
  INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
   ('e1000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-00000000000d','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',30,'EUR'),
   ('e1000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',100,'EUR');
  PERFORM public.kp_as('a0000000-0000-0000-0000-00000000000a');
  r := public.krug_override_propose('e1000000-0000-0000-0000-000000000005',
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":50}]');
  PERFORM public.kp_as('b0000000-0000-0000-0000-00000000000b');
  PERFORM public.krug_override_confirm((r->>'id')::uuid);
  PERFORM public.kp_as('a0000000-0000-0000-0000-00000000000a');
  r := public.krug_override_propose('e1000000-0000-0000-0000-000000000006',
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":0},{"user_id":"c0000000-0000-0000-0000-00000000000c","share_percent":50}]', 40);
  ov := (r->>'id')::uuid;
  PERFORM public.kp_as('b0000000-0000-0000-0000-00000000000b');
  PERFORM public.krug_override_confirm(ov);
  PERFORM public.kp_as('c0000000-0000-0000-0000-00000000000c');
  PERFORM public.krug_override_confirm(ov);
  FOR j IN SELECT public.kp_prev(u, cur, '{"USD":1.1}') FROM (VALUES ('a0000000-0000-0000-0000-00000000000a'),('b0000000-0000-0000-0000-00000000000b')) x(u), (VALUES ('EUR'),('USD')) c(cur) LOOP
    IF abs(public.kp_sum_net(j)) > 0.02 THEN RAISE EXCEPTION 'FAIL P6 neravnoteža % u %', public.kp_sum_net(j), j->>'display_currency'; END IF;
  END LOOP;
  j := public.kp_prev('a0000000-0000-0000-0000-00000000000a');
  IF (public.kp_member(j,'d0000000-0000-0000-0000-00000000000d')->>'paid')::numeric <> 30 THEN RAISE EXCEPTION 'FAIL P6 D paid %', j; END IF;
  IF (public.kp_member(j,'c0000000-0000-0000-0000-00000000000c')->>'owed')::numeric <> 30 THEN RAISE EXCEPTION 'FAIL P6 C owed (10+20) %', j; END IF;
  j := public.kp_prev('d0000000-0000-0000-0000-00000000000d');
  IF (j->'members'->0->>'net')::numeric <> 30 OR jsonb_array_length(j->'transfers') <> 2 THEN RAISE EXCEPTION 'FAIL P6 D pogled %', j; END IF;
  RAISE NOTICE 'PASS P6 D platitelj 30 (A/B po 15): zbroj neto 0 u EUR i USD; D vidi dva duga prema sebi; „Dijeli samo 40" s C → C duguje još 20';
END $$;

-- P7 podmirenje: obični podmiruje svoj dug, ne tuđi; bivši ne podmiruje ni ne potvrđuje
DO $$ DECLARE r jsonb; lid uuid; BEGIN
  PERFORM public.kp_as('c0000000-0000-0000-0000-00000000000c');
  r := public.krug_mark_settled_with_source('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c',
        'a0000000-0000-0000-0000-00000000000a',30,'EUR','5c000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001');
  lid := (r->>'id')::uuid;
  IF (SELECT expense_nature FROM public.expenses WHERE id=(r->>'payer_expense_id')::uuid) <> 'krug_settlement' THEN RAISE EXCEPTION 'FAIL P7 knjiženje'; END IF;
  r := public.krug_mark_settled_with_source('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c',
        'a0000000-0000-0000-0000-00000000000a',30,'EUR','5c000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000001');
  IF NOT (r->>'idempotent')::boolean OR (r->>'id')::uuid <> lid THEN RAISE EXCEPTION 'FAIL P7 idempotentnost %', r; END IF;
  BEGIN
    PERFORM public.krug_mark_settled_with_source('c1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',
        'a0000000-0000-0000-0000-00000000000a',5,'EUR','5c000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL P7 tuđi dug';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'only_debtor_can_settle' THEN RAISE EXCEPTION 'FAIL P7 tuđi: %', SQLERRM; END IF; END;
  BEGIN
    PERFORM public.krug_mark_settled_with_source('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c',
        'e0000000-0000-0000-0000-00000000000e',5,'EUR','5c000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'FAIL P7 bivši kao primatelj';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'party_not_member' THEN RAISE EXCEPTION 'FAIL P7 primatelj: %', SQLERRM; END IF; END;
  PERFORM public.kp_as('e0000000-0000-0000-0000-00000000000e');
  BEGIN
    PERFORM public.krug_mark_settled_with_source('c1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000e',
        'a0000000-0000-0000-0000-00000000000a',5,'EUR','5c000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'FAIL P7 bivši podmirio';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'not_member' THEN RAISE EXCEPTION 'FAIL P7 bivši: %', SQLERRM; END IF; END;
  INSERT INTO public.krug_settlement_ledger(id,krug_id,from_user,to_user,amount,currency,client_request_id,marked_by)
  VALUES ('1e700000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',
          'e0000000-0000-0000-0000-00000000000e',3,'EUR','f7000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-00000000000a');
  BEGIN
    PERFORM public.krug_confirm_settlement_receipt('1e700000-0000-0000-0000-000000000001','5c000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000005');
    RAISE EXCEPTION 'FAIL P7 bivši potvrdio';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'not_member' THEN RAISE EXCEPTION 'FAIL P7 potvrda bivšeg: %', SQLERRM; END IF; END;
  DELETE FROM public.krug_settlement_ledger WHERE id='1e700000-0000-0000-0000-000000000001';
  PERFORM public.kp_as('a0000000-0000-0000-0000-00000000000a');
  r := public.krug_confirm_settlement_receipt(lid,'5c000000-0000-0000-0000-000000000001','f7000000-0000-0000-0000-000000000006');
  IF (SELECT recipient_confirmed_at FROM public.krug_settlement_ledger WHERE id=lid) IS NULL THEN RAISE EXCEPTION 'FAIL P7 A potvrda'; END IF;
  IF jsonb_array_length(public.kp_prev('c0000000-0000-0000-0000-00000000000c')->'transfers') <> 0 THEN RAISE EXCEPTION 'FAIL P7 C dug nakon podmirenja'; END IF;
  IF abs(public.kp_sum_net(public.kp_prev('a0000000-0000-0000-0000-00000000000a'))) > 0.01 THEN RAISE EXCEPTION 'FAIL P7 neravnoteža'; END IF;
  RAISE NOTICE 'PASS P7 C podmirio 30 (idempotentno, krug_settlement); tuđi dug i bivši primatelj odbijeni; bivši ne podmiruje ni ne potvrđuje; C bez duga, zbroj 0';
END $$;

-- P8 „Nisam primio"/„Poništi": obični na svom retku da, tuđi ne
DO $$ DECLARE r jsonb; lid uuid; BEGIN
  PERFORM public.kp_as('c0000000-0000-0000-0000-00000000000c');
  r := public.krug_mark_settled_with_source('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c',
        'a0000000-0000-0000-0000-00000000000a',1,'EUR','5c000000-0000-0000-0000-000000000001','f8000000-0000-0000-0000-000000000001');
  lid := (r->>'id')::uuid;
  PERFORM public.kp_as('d0000000-0000-0000-0000-00000000000d');
  BEGIN PERFORM public.krug_void_settlement(lid, 'x'); RAISE EXCEPTION 'FAIL P8 D poništio';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'only_party_can_void' THEN RAISE EXCEPTION 'FAIL P8 D: %', SQLERRM; END IF; END;
  PERFORM public.kp_as('c0000000-0000-0000-0000-00000000000c');
  PERFORM public.krug_void_settlement(lid, 'greška');
  IF (SELECT voided_by FROM public.krug_settlement_ledger WHERE id=lid) <> 'c0000000-0000-0000-0000-00000000000c' THEN RAISE EXCEPTION 'FAIL P8 void'; END IF;
  RAISE NOTICE 'PASS P8 C poništava svoj redak; D (nije strana) odbijen';
END $$;

-- P9 RLS: obični vidi samo prijedloge u kojima ima udio
DO $$ DECLARE n bigint; BEGIN
  n := public.kp_rls('c0000000-0000-0000-0000-00000000000c', 'SELECT count(*) FROM public.krug_expense_split_override');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL P9 C vidi % prijedloga', n; END IF;
  n := public.kp_rls('c0000000-0000-0000-0000-00000000000c', 'SELECT count(DISTINCT override_id) FROM public.krug_expense_split_share');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL P9 C vidi udjele % prijedloga', n; END IF;
  n := public.kp_rls('d0000000-0000-0000-0000-00000000000d', 'SELECT count(*) FROM public.krug_expense_split_override');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL P9 D vidi % prijedloga', n; END IF;
  n := public.kp_rls('e0000000-0000-0000-0000-00000000000e', 'SELECT count(*) FROM public.krug_expense_split_confirmation');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL P9 bivši vidi potvrde'; END IF;
  n := public.kp_rls('b0000000-0000-0000-0000-00000000000b', 'SELECT count(*) FROM public.krug_expense_split_override');
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL P9 B vidi % (očekivano 4)', n; END IF;
  RAISE NOTICE 'PASS P9 C vidi 2 svoja prijedloga, D 1 (odbijeni), bivši 0, punopravni svih 4';
END $$;

-- P10 stari poziv bez p_shared_amount i prava
DO $$ DECLARE r jsonb; fn text; BEGIN
  INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
   ('e1000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-00000000000b','c1000000-0000-0000-0000-000000000001','shared','potvrdjena',9,'EUR');
  PERFORM public.kp_as('b0000000-0000-0000-0000-00000000000b');
  r := public.krug_override_propose('e1000000-0000-0000-0000-000000000007'::uuid,
    '[{"user_id":"a0000000-0000-0000-0000-00000000000a","share_percent":50},{"user_id":"b0000000-0000-0000-0000-00000000000b","share_percent":50}]'::jsonb);
  IF NOT (r->>'ok')::boolean OR (r->>'awaiting_confirmations')::int <> 1 THEN RAISE EXCEPTION 'FAIL P10 stari poziv %', r; END IF;
  FOREACH fn IN ARRAY ARRAY['krug_override_propose(uuid,jsonb,numeric)','krug_override_confirm(uuid)','krug_override_reject(uuid,text)',
     'krug_mark_settled_with_source(uuid,uuid,uuid,numeric,text,uuid,uuid,numeric,text)','krug_confirm_settlement_receipt(uuid,uuid,uuid,numeric)',
     'krug_void_settlement(uuid,text)','krug_settlement_preview(uuid,date,date,text,jsonb)','krug_override_party(uuid,uuid)'] LOOP
    IF has_function_privilege('anon', 'public.'||fn, 'EXECUTE') THEN RAISE EXCEPTION 'FAIL P10 anon smije %', fn; END IF;
    IF NOT has_function_privilege('authenticated', 'public.'||fn, 'EXECUTE') THEN RAISE EXCEPTION 'FAIL P10 authenticated ne smije %', fn; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = ('public.'||fn)::regprocedure AND a.grantee = 0) THEN
      RAISE EXCEPTION 'FAIL P10 PUBLIC smije %', fn; END IF;
  END LOOP;
  RAISE NOTICE 'PASS P10 stari poziv (2 argumenta) radi; 8 funkcija: anon i PUBLIC bez prava, authenticated s pravom';
END $$;
