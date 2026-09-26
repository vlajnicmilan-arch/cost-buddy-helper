-- krug_shared_amount čuvari S1–S9. Svaki DO blok pada s 'FAIL Sx'.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.ksa_prev(p_rates jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.krug_settlement_preview('11111111-0000-0000-0000-000000000001',
   date_trunc('month',current_date)::date, (date_trunc('month',current_date)+interval '1 month -1 day')::date,
   'EUR', p_rates) $$;
CREATE OR REPLACE FUNCTION public.ksa_owed(j jsonb, u text) RETURNS numeric LANGUAGE sql AS $$
  SELECT (m->>'owed')::numeric FROM jsonb_array_elements(j->'members') m WHERE m->>'user_id'=u $$;
CREATE OR REPLACE FUNCTION public.ksa_paid(j jsonb, u text) RETURNS numeric LANGUAGE sql AS $$
  SELECT (m->>'paid')::numeric FROM jsonb_array_elements(j->'members') m WHERE m->>'user_id'=u $$;
CREATE OR REPLACE FUNCTION public.ksa_as(u text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', u, false) $$;

-- S1 NULL = isto kao prije migracije
DO $$ DECLARE a jsonb; b jsonb; BEGIN
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  a := (SELECT j FROM public.ksa_before) - 'fx'; b := public.ksa_prev() - 'fx';
  IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'FAIL S1 before=% after=%', a, b; END IF;
  RAISE NOTICE 'PASS S1 NULL daje isti rezultat';
END $$;

-- Novi trošak: 40 EUR, autor A, dijeli se samo 12.
INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
 ('eeeeeeee-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','shared','potvrdjena',40,'EUR');

-- S2 svota veća od iznosa / nula se odbija; CHECK na tablici
DO $$ BEGIN
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.krug_override_propose('eeeeeeee-0000-0000-0000-0000000000b1',
      '[{"user_id":"aaaaaaaa-0000-0000-0000-000000000001","share_percent":50},{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","share_percent":50}]', 40.01);
    RAISE EXCEPTION 'FAIL S2 veća svota prošla';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'shared_amount_exceeds_amount' THEN RAISE EXCEPTION 'FAIL S2 kod %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.krug_override_propose('eeeeeeee-0000-0000-0000-0000000000b1',
      '[{"user_id":"aaaaaaaa-0000-0000-0000-000000000001","share_percent":50},{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","share_percent":50}]', 0);
    RAISE EXCEPTION 'FAIL S2 nula prošla';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'shared_amount_invalid' THEN RAISE EXCEPTION 'FAIL S2 kod %', SQLERRM; END IF;
  END;
  BEGIN
    INSERT INTO public.krug_expense_split_override(expense_id,krug_id,proposed_by,shared_amount)
      VALUES ('eeeeeeee-0000-0000-0000-0000000000b1','11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',-1);
    RAISE EXCEPTION 'FAIL S2 CHECK';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.krug_expense_split_override WHERE expense_id='eeeeeeee-0000-0000-0000-0000000000b1') THEN
    RAISE EXCEPTION 'FAIL S2 ostao red'; END IF;
  RAISE NOTICE 'PASS S2 veća svota/nula/negativna odbijena';
END $$;

-- S3 A1 sa svotom: prijedlog 12 € 50/50, B potvrdi → samo 12 ulazi u Tko kome
DO $$ DECLARE r jsonb; oid uuid; b jsonb; a jsonb; BEGIN
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  a := public.ksa_prev();
  r := public.krug_override_propose('eeeeeeee-0000-0000-0000-0000000000b1',
      '[{"user_id":"aaaaaaaa-0000-0000-0000-000000000001","share_percent":50},{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","share_percent":50}]', 12);
  oid := (r->>'id')::uuid;
  IF (SELECT shared_amount FROM public.krug_expense_split_override WHERE id=oid) <> 12 THEN RAISE EXCEPTION 'FAIL S3 svota nije spremljena'; END IF;
  PERFORM public.ksa_as('bbbbbbbb-0000-0000-0000-000000000002');
  PERFORM public.krug_override_confirm(oid);
  b := public.ksa_prev();
  -- razlika prema stanju s b1 bez overridea (40 € 50/50): A paid -28, owed -14; B owed -14
  IF public.ksa_paid(b,'aaaaaaaa-0000-0000-0000-000000000001') - public.ksa_paid(a,'aaaaaaaa-0000-0000-0000-000000000001') <> -28
  THEN RAISE EXCEPTION 'FAIL S3 paid % %', a, b; END IF;
  IF public.ksa_owed(a,'bbbbbbbb-0000-0000-0000-000000000002') - public.ksa_owed(b,'bbbbbbbb-0000-0000-0000-000000000002') <> 14
  THEN RAISE EXCEPTION 'FAIL S3 owed B % %', a, b; END IF;
  RAISE NOTICE 'PASS S3 A1: dijeljena svota ulazi, ostatak 28 ne';
END $$;

-- S4 postotci se odnose na dijeljenu svotu (novi prijedlog 70/30 na 12)
DO $$ DECLARE r jsonb; a jsonb; b jsonb; BEGIN
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  a := public.ksa_prev();
  r := public.krug_override_propose('eeeeeeee-0000-0000-0000-0000000000b1',
      '[{"user_id":"aaaaaaaa-0000-0000-0000-000000000001","share_percent":70},{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","share_percent":30}]', 12);
  PERFORM public.ksa_as('bbbbbbbb-0000-0000-0000-000000000002');
  PERFORM public.krug_override_confirm((r->>'id')::uuid);
  b := public.ksa_prev();
  -- B: s 6 (50 %) na 3.6 (30 %) → -2.4
  IF public.ksa_owed(a,'bbbbbbbb-0000-0000-0000-000000000002') - public.ksa_owed(b,'bbbbbbbb-0000-0000-0000-000000000002') <> 2.4
  THEN RAISE EXCEPTION 'FAIL S4 % %', a, b; END IF;
  IF (SELECT count(*) FROM public.krug_expense_split_override WHERE expense_id='eeeeeeee-0000-0000-0000-0000000000b1' AND status='potvrdjena') <> 1
  THEN RAISE EXCEPTION 'FAIL S4 dva aktivna'; END IF;
  RAISE NOTICE 'PASS S4 postotci na dijeljenu svotu';
END $$;

-- S5 spajanje smanji iznos ispod svote → LEAST, bez greške; podjela ostaje
DO $$ DECLARE a jsonb; b jsonb; BEGIN
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  a := public.ksa_prev();
  UPDATE public.expenses SET amount = 10 WHERE id='eeeeeeee-0000-0000-0000-0000000000b1';
  b := public.ksa_prev();
  IF NOT EXISTS (SELECT 1 FROM public.krug_expense_split_override WHERE expense_id='eeeeeeee-0000-0000-0000-0000000000b1' AND status='potvrdjena' AND shared_amount=12)
  THEN RAISE EXCEPTION 'FAIL S5 podjela izgubljena'; END IF;
  -- 12 → 10: A paid -2, B owed 3.6 → 3.0
  IF public.ksa_paid(a,'aaaaaaaa-0000-0000-0000-000000000001') - public.ksa_paid(b,'aaaaaaaa-0000-0000-0000-000000000001') <> 2
     OR public.ksa_owed(a,'bbbbbbbb-0000-0000-0000-000000000002') - public.ksa_owed(b,'bbbbbbbb-0000-0000-0000-000000000002') <> 0.6
  THEN RAISE EXCEPTION 'FAIL S5 % %', a, b; END IF;
  UPDATE public.expenses SET amount = 40 WHERE id='eeeeeeee-0000-0000-0000-0000000000b1';
  RAISE NOTICE 'PASS S5 spajanje čuva podjelu, LEAST bez greške';
END $$;

-- S6 A2 sa svotom: odbijen prijedlog ne mijenja raspodjelu
DO $$ DECLARE r jsonb; a jsonb; b jsonb; BEGIN
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  a := public.ksa_prev();
  r := public.krug_override_propose('eeeeeeee-0000-0000-0000-0000000000b1',
      '[{"user_id":"aaaaaaaa-0000-0000-0000-000000000001","share_percent":0},{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","share_percent":100}]', 20);
  PERFORM public.ksa_as('bbbbbbbb-0000-0000-0000-000000000002');
  PERFORM public.krug_override_reject((r->>'id')::uuid, 'ne');
  b := public.ksa_prev();
  IF (SELECT status FROM public.krug_expense_split_override WHERE id=(r->>'id')::uuid) <> 'odbijena' THEN RAISE EXCEPTION 'FAIL S6 status'; END IF;
  IF (a - 'fx') IS DISTINCT FROM (b - 'fx') THEN RAISE EXCEPTION 'FAIL S6 % %', a, b; END IF;
  RAISE NOTICE 'PASS S6 A2: odbijena svota ne ulazi';
END $$;

-- S7 FX: 100 USD, dijeli se 50 USD, 1 EUR = 1.25 USD → 40 EUR u raspodjeli
DO $$ DECLARE r jsonb; a jsonb; b jsonb; BEGIN
  INSERT INTO public.expenses(id,user_id,krug_id,krug_privacy,krug_shared_status,amount,currency) VALUES
   ('eeeeeeee-0000-0000-0000-0000000000c1','bbbbbbbb-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','shared','potvrdjena',100,'USD');
  PERFORM public.ksa_as('bbbbbbbb-0000-0000-0000-000000000002');
  a := public.ksa_prev('{"USD":1.25}');
  r := public.krug_override_propose('eeeeeeee-0000-0000-0000-0000000000c1',
      '[{"user_id":"aaaaaaaa-0000-0000-0000-000000000001","share_percent":50},{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","share_percent":50}]', 50);
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  PERFORM public.krug_override_confirm((r->>'id')::uuid);
  b := public.ksa_prev('{"USD":1.25}');
  -- prije: B paid 80 EUR, A owed 40; poslije: B paid 40, A owed 20
  IF public.ksa_paid(a,'bbbbbbbb-0000-0000-0000-000000000002') - public.ksa_paid(b,'bbbbbbbb-0000-0000-0000-000000000002') <> 40
     OR public.ksa_owed(a,'aaaaaaaa-0000-0000-0000-000000000001') - public.ksa_owed(b,'aaaaaaaa-0000-0000-0000-000000000001') <> 20
  THEN RAISE EXCEPTION 'FAIL S7 % %', a, b; END IF;
  BEGIN
    PERFORM public.ksa_as('bbbbbbbb-0000-0000-0000-000000000002');
    PERFORM public.krug_override_propose('eeeeeeee-0000-0000-0000-0000000000c1',
      '[{"user_id":"aaaaaaaa-0000-0000-0000-000000000001","share_percent":50},{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","share_percent":50}]', 100.01);
    RAISE EXCEPTION 'FAIL S7 provjera u valuti troška';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  RAISE NOTICE 'PASS S7 FX na dijeljenu svotu (valuta troška)';
END $$;

-- S8 invarijanta: zbroj paid = zbroj owed
DO $$ DECLARE j jsonb; BEGIN
  PERFORM public.ksa_as('aaaaaaaa-0000-0000-0000-000000000001');
  j := public.ksa_prev('{"USD":1.25}');
  IF abs((SELECT sum((m->>'paid')::numeric - (m->>'owed')::numeric) FROM jsonb_array_elements(j->'members') m)) > 0.02
  THEN RAISE EXCEPTION 'FAIL S8 %', j; END IF;
  RAISE NOTICE 'PASS S8 paid = owed';
END $$;

-- S9 prava: jedan oblik, anon ne, authenticated/service_role da
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname='krug_override_propose') <> 1 THEN RAISE EXCEPTION 'FAIL S9 više oblika'; END IF;
  IF to_regprocedure('public.krug_override_propose(uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'FAIL S9 stari oblik'; END IF;
  IF has_function_privilege('anon','public.krug_override_propose(uuid,jsonb,numeric)','EXECUTE')
     OR has_function_privilege('anon','public.krug_settlement_preview(uuid,date,date,text,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL S9 anon'; END IF;
  IF NOT has_function_privilege('authenticated','public.krug_override_propose(uuid,jsonb,numeric)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.krug_override_propose(uuid,jsonb,numeric)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.krug_settlement_preview(uuid,date,date,text,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL S9 authenticated/service_role'; END IF;
  RAISE NOTICE 'PASS S9 prava';
END $$;
