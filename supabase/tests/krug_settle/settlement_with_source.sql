-- Krug podmirenje s izborom izvora — čuvari.
-- Svaki čuvar je zaseban DO blok i sam postavlja svijet, pa u TODAY=1 načinu
-- (bez migracije) svaki pada za sebe. Baza je baciva; nema zajedničke transakcije.

\set petar  '''00000000-0000-0000-0000-0000000000a1'''
\set milan  '''00000000-0000-0000-0000-0000000000b2'''
\set ana    '''00000000-0000-0000-0000-0000000000c3'''

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1','petar.harness@example.test'),
  ('00000000-0000-0000-0000-0000000000b2','milan.harness@example.test'),
  ('00000000-0000-0000-0000-0000000000c3','ana.harness@example.test')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (user_id, display_name, preferred_language) VALUES
  ('00000000-0000-0000-0000-0000000000a1','Petar','hr'),
  ('00000000-0000-0000-0000-0000000000b2','Milan','en'),
  ('00000000-0000-0000-0000-0000000000c3','Ana','hr')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.krug (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111','Stan Tajni Naziv Kruga')
ON CONFLICT DO NOTHING;
INSERT INTO public.krug_ownership VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.krug_membership VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b2','punopravni'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c3','punopravni');

CREATE OR REPLACE FUNCTION pg_temp.ok(label text, cond boolean, detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(cond,false) THEN RAISE NOTICE 'PASS % %', label, detail;
  ELSE RAISE EXCEPTION 'FAIL % %', label, detail; END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(u::text,''), false)::text::void $$;

CREATE OR REPLACE FUNCTION pg_temp.bal(src uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance FROM public.custom_payment_sources WHERE id = src $$;

/** Očekuje grešku s točnim kodom; hvata "FAIL" iz poziva. */
CREATE OR REPLACE FUNCTION pg_temp.raises(label text, sql text, expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text;
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg = expected THEN RAISE NOTICE 'PASS % — %', label, v_msg; RETURN; END IF;
    RAISE EXCEPTION 'FAIL % — expected "%", got "%"', label, expected, v_msg;
  END;
  RAISE EXCEPTION 'FAIL % — expected "%", call succeeded', label, expected;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.reset_world() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  DELETE FROM public.krug_settlement_ledger;
  DELETE FROM public.expenses WHERE user_id IN
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c3');
  DELETE FROM public.payment_source_members;
  DELETE FROM public.custom_payment_sources WHERE user_id IN
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c3');
  INSERT INTO public.custom_payment_sources (id, user_id, name, balance, currency) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Petar Revolut',0,'EUR'),
    ('aaaaaaaa-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Petar USD',0,'USD'),
    ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','Milan Tekući',0,'EUR'),
    ('cccccccc-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','Ana Keš',0,'EUR'),
    ('cccccccc-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c3','Ana dijeljeni',0,'EUR');
  -- Petar je samo 'viewer' na Aninom dijeljenom izvoru (ne smije pisati).
  INSERT INTO public.payment_source_members (payment_source_id, user_id, role) VALUES
    ('cccccccc-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','viewer');
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.settle(req uuid, src uuid DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  payer_amt numeric DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.krug_mark_settled_with_source(
    '11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2', 20, 'EUR', src, req, payer_amt, NULL) $$;

-- G1 ------------------------------------------------------------------------
DO $$
DECLARE r jsonb; v_cnt int; v_e record; v_l record;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000001');
  SELECT count(*) INTO v_cnt FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000a1';
  PERFORM pg_temp.ok('G1.1 točno jedna dužnikova transakcija', v_cnt = 1, v_cnt::text);
  SELECT * INTO v_e FROM public.expenses WHERE id = (r->>'payer_expense_id')::uuid;
  PERFORM pg_temp.ok('G1.2 na odabranom izvoru', v_e.payment_source = 'custom:aaaaaaaa-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok('G1.3 trošak 20 EUR', v_e.type='expense' AND v_e.amount=20 AND v_e.currency='EUR');
  PERFORM pg_temp.ok('G1.4 saldo izvora pao za 20', pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001') = -20,
    pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001')::text);
  SELECT * INTO v_l FROM public.krug_settlement_ledger WHERE id = (r->>'id')::uuid;
  PERFORM pg_temp.ok('G1.5 zapis vezan na transakciju i izvor',
    v_l.payer_expense_id = v_e.id AND v_l.payer_source_id='aaaaaaaa-0000-0000-0000-000000000001'
    AND v_l.payer_amount=20 AND v_l.payer_currency='EUR' AND v_l.recipient_confirmed_at IS NULL);
END $$;

-- G2 ne-dužnik ne može podmiriti --------------------------------------------
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  PERFORM pg_temp.raises('G2.1 treća osoba ne podmiruje tuđi dug',
    $q$SELECT pg_temp.settle('e0000000-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001')$q$,
    'only_debtor_can_settle');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('G2.2 vjerovnik ne bilježi umjesto dužnika',
    $q$SELECT pg_temp.settle('e0000000-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000001')$q$,
    'only_debtor_can_settle');
  SELECT count(*) INTO v_cnt FROM public.expenses;
  PERFORM pg_temp.ok('G2.3 ništa nije upisano', v_cnt = 0 AND NOT EXISTS (SELECT 1 FROM public.krug_settlement_ledger));
END $$;

-- G3 izvor u koji ne smije pisati -------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.raises('G3.1 tuđi izvor odbijen',
    $q$SELECT pg_temp.settle('e0000000-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000001')$q$,
    'source_not_writable');
  PERFORM pg_temp.raises('G3.2 dijeljeni izvor s ulogom viewer odbijen',
    $q$SELECT pg_temp.settle('e0000000-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000002')$q$,
    'source_not_writable');
  PERFORM pg_temp.ok('G3.3 sve ili ništa: ni zapis ni transakcija',
    NOT EXISTS (SELECT 1 FROM public.expenses) AND NOT EXISTS (SELECT 1 FROM public.krug_settlement_ledger));
  -- Dijeljeni izvor s pravom pisanja je dopušten.
  UPDATE public.payment_source_members SET role='full';
  PERFORM pg_temp.settle('e0000000-0000-0000-0000-000000000006','cccccccc-0000-0000-0000-000000000002');
  PERFORM pg_temp.ok('G3.4 dijeljeni izvor s pravom pisanja prolazi',
    pg_temp.bal('cccccccc-0000-0000-0000-000000000002') = -20);
END $$;

-- G4 dvostruki klik = jedno podmirenje ---------------------------------------
DO $$
DECLARE r1 jsonb; r2 jsonb; v_l int; v_e int;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r1 := pg_temp.settle('e0000000-0000-0000-0000-000000000007');
  r2 := pg_temp.settle('e0000000-0000-0000-0000-000000000007');
  SELECT count(*) INTO v_l FROM public.krug_settlement_ledger;
  SELECT count(*) INTO v_e FROM public.expenses;
  PERFORM pg_temp.ok('G4.1 jedan zapis i jedna transakcija', v_l = 1 AND v_e = 1, v_l||'/'||v_e);
  PERFORM pg_temp.ok('G4.2 drugi poziv idempotentan, isti id',
    (r2->>'idempotent')::boolean AND r1->>'id' = r2->>'id');
  PERFORM pg_temp.ok('G4.3 saldo pao samo jednom', pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001') = -20);
END $$;

-- G5 samo primatelj potvrđuje, jednom ----------------------------------------
DO $$
DECLARE r jsonb; c jsonb; c2 jsonb; v_id uuid; v_inc int; v_e record;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000008');
  v_id := (r->>'id')::uuid;
  PERFORM pg_temp.raises('G5.1 dužnik ne potvrđuje primitak',
    format($q$SELECT public.krug_confirm_settlement_receipt(%L,'aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001')$q$, v_id),
    'only_recipient_can_confirm');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  PERFORM pg_temp.raises('G5.2 treća osoba ne potvrđuje',
    format($q$SELECT public.krug_confirm_settlement_receipt(%L,'cccccccc-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002')$q$, v_id),
    'only_recipient_can_confirm');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('G5.3 primatelj ne potvrđuje u tuđi izvor',
    format($q$SELECT public.krug_confirm_settlement_receipt(%L,'cccccccc-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000003')$q$, v_id),
    'source_not_writable');
  c := public.krug_confirm_settlement_receipt(v_id, 'bbbbbbbb-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004');
  SELECT * INTO v_e FROM public.expenses WHERE id = (c->>'recipient_expense_id')::uuid;
  PERFORM pg_temp.ok('G5.4 priljev +20 na primateljev izvor',
    v_e.type='income' AND v_e.amount=20 AND pg_temp.bal('bbbbbbbb-0000-0000-0000-000000000001') = 20);
  c2 := public.krug_confirm_settlement_receipt(v_id, 'bbbbbbbb-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.ok('G5.5 isti zahtjev idempotentan', (c2->>'idempotent')::boolean);
  PERFORM pg_temp.raises('G5.6 druga potvrda odbijena',
    format($q$SELECT public.krug_confirm_settlement_receipt(%L,'bbbbbbbb-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000005')$q$, v_id),
    'already_confirmed');
  SELECT count(*) INTO v_inc FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000b2';
  PERFORM pg_temp.ok('G5.7 točno jedan priljev', v_inc = 1, v_inc::text);
  PERFORM pg_temp.ok('G5.8 saldo primatelja jednom', pg_temp.bal('bbbbbbbb-0000-0000-0000-000000000001') = 20);
END $$;

-- G6 poništenje nakon potvrde briše obje transakcije i vraća salda ----------
DO $$
DECLARE r jsonb; v jsonb; v_id uuid; v_alive int;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000009');
  v_id := (r->>'id')::uuid;
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM public.krug_confirm_settlement_receipt(v_id, 'bbbbbbbb-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006');
  v := public.krug_void_settlement(v_id, 'krivo zabilježeno');
  SELECT count(*) INTO v_alive FROM public.expenses WHERE deleted_at IS NULL;
  PERFORM pg_temp.ok('G6.1 obje transakcije u košu', v_alive = 0, v_alive::text);
  PERFORM pg_temp.ok('G6.2 saldo dužnika vraćen', pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001') = 0);
  PERFORM pg_temp.ok('G6.3 saldo primatelja vraćen', pg_temp.bal('bbbbbbbb-0000-0000-0000-000000000001') = 0);
  PERFORM pg_temp.ok('G6.4 bank_linked_kept=false', (v->>'bank_linked_kept')::boolean = false);
END $$;

-- G7 vrsta zapisa: nije potrošnja ni prihod, bez krug_id ---------------------
DO $$
DECLARE r jsonb; v_bad int;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000010');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM public.krug_confirm_settlement_receipt((r->>'id')::uuid, 'bbbbbbbb-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000007');
  SELECT count(*) INTO v_bad FROM public.expenses
   WHERE expense_nature IS DISTINCT FROM 'krug_settlement' OR krug_id IS NOT NULL;
  PERFORM pg_temp.ok('G7.1 obje nose krug_settlement i nemaju krug_id',
    v_bad = 0 AND (SELECT count(*) FROM public.expenses) = 2);
END $$;

-- G8 valuta: različita valuta izvora traži stvarno plaćeni iznos ------------
DO $$
DECLARE r jsonb; v_e record;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.raises('G8.1 USD izvor bez iznosa odbijen',
    $q$SELECT pg_temp.settle('e0000000-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000002')$q$,
    'payer_amount_required');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000002', 23.40);
  SELECT * INTO v_e FROM public.expenses WHERE id = (r->>'payer_expense_id')::uuid;
  PERFORM pg_temp.ok('G8.2 transakcija u valuti izvora s upisanim iznosom',
    v_e.amount = 23.40 AND v_e.currency = 'USD');
  PERFORM pg_temp.ok('G8.3 dug ostaje u valuti podmirenja',
    (SELECT amount = 20 AND currency = 'EUR' AND payer_amount = 23.40 AND payer_currency = 'USD'
       FROM public.krug_settlement_ledger WHERE id = (r->>'id')::uuid));
END $$;

-- G9 spajanje s bankom čuva krug_settlement ----------------------------------
DO $$
DECLARE r jsonb; v_m uuid; v_b uuid; v_before numeric;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000013');
  v_m := (r->>'payer_expense_id')::uuid;
  INSERT INTO public.expenses (user_id, type, amount, payment_source, date, currency, description,
                               bank_transaction_id, bank_match_status)
  VALUES ('00000000-0000-0000-0000-0000000000a1','expense',20,'custom:aaaaaaaa-0000-0000-0000-000000000001',
          now() + interval '1 day','EUR','REVOLUT TRANSFER MILAN','imp2:krug-g9','bank_only')
  RETURNING id INTO v_b;
  v_before := pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001');
  PERFORM public.merge_manual_with_bank(v_m, v_b);
  PERFORM pg_temp.ok('G9.1 spojeni redak ostaje krug_settlement',
    (SELECT expense_nature = 'krug_settlement' AND bank_match_status = 'confirmed'
       FROM public.expenses WHERE id = v_m));
  PERFORM pg_temp.ok('G9.2 saldo nakon spajanja = saldo prije + samo bankovni duplikat nestao',
    pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001') = v_before + 20,
    v_before||' -> '||pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001'));
END $$;

-- G10 poništenje nad spojenim retkom -----------------------------------------
DO $$
DECLARE r jsonb; v_m uuid; v_b uuid; v jsonb; v_before numeric; v_row record;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000014');
  v_m := (r->>'payer_expense_id')::uuid;
  INSERT INTO public.expenses (user_id, type, amount, payment_source, date, currency, description,
                               bank_transaction_id, bank_match_status)
  VALUES ('00000000-0000-0000-0000-0000000000a1','expense',20,'custom:aaaaaaaa-0000-0000-0000-000000000001',
          now(),'EUR','REVOLUT TRANSFER MILAN','imp2:krug-g10','bank_only')
  RETURNING id INTO v_b;
  PERFORM public.merge_manual_with_bank(v_m, v_b);
  v_before := pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001');
  v := public.krug_void_settlement((r->>'id')::uuid, 'dvostruko');
  SELECT * INTO v_row FROM public.expenses WHERE id = v_m;
  PERFORM pg_temp.ok('G10.1 spojeni redak nije obrisan', v_row.deleted_at IS NULL);
  PERFORM pg_temp.ok('G10.2 i dalje krug_settlement s bankovnim otiskom',
    v_row.expense_nature = 'krug_settlement' AND v_row.bank_transaction_id = 'imp2:krug-g10');
  PERFORM pg_temp.ok('G10.3 saldo banke nepromijenjen',
    pg_temp.bal('aaaaaaaa-0000-0000-0000-000000000001') = v_before);
  PERFORM pg_temp.ok('G10.4 bank_linked_kept=true', (v->>'bank_linked_kept')::boolean);
  PERFORM pg_temp.ok('G10.5 odvojen od poništenog zapisa',
    (SELECT payer_expense_id IS NULL AND voided_at IS NOT NULL
       FROM public.krug_settlement_ledger WHERE id = (r->>'id')::uuid));
END $$;

-- G11 opis bez imena Kruga, jezik korisnika ----------------------------------
DO $$
DECLARE r jsonb; c jsonb; v_payer text; v_recv text;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := pg_temp.settle('e0000000-0000-0000-0000-000000000015');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  c := public.krug_confirm_settlement_receipt((r->>'id')::uuid, 'bbbbbbbb-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000008');
  SELECT description INTO v_payer FROM public.expenses WHERE id = (r->>'payer_expense_id')::uuid;
  SELECT description INTO v_recv FROM public.expenses WHERE id = (c->>'recipient_expense_id')::uuid;
  PERFORM pg_temp.ok('G11.1 dužnik (hr)', v_payer = 'Podmirenje duga — Milan', v_payer);
  PERFORM pg_temp.ok('G11.2 primatelj (en)', v_recv = 'Debt settlement — Petar', v_recv);
  PERFORM pg_temp.ok('G11.3 bez imena Kruga',
    position('Tajni' in v_payer) = 0 AND position('Tajni' in v_recv) = 0);
END $$;

-- G12 stari krug_mark_settled nepromijenjen; točno jedan oblik funkcija -----
DO $$
DECLARE v_n int;
BEGIN
  PERFORM pg_temp.reset_world();
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  PERFORM public.krug_mark_settled('11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2', 5, 'EUR', NULL);
  PERFORM pg_temp.ok('G12.1 stari put i dalje bez transakcije',
    NOT EXISTS (SELECT 1 FROM public.expenses) AND (SELECT count(*) FROM public.krug_settlement_ledger) = 1);
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname IN
    ('krug_mark_settled_with_source','krug_confirm_settlement_receipt','krug_void_settlement','krug_mark_settled');
  PERFORM pg_temp.ok('G12.2 točno jedan oblik svake funkcije', v_n = 4, v_n::text);
  PERFORM pg_temp.ok('G12.3 anon ne smije izvršiti nove funkcije',
    NOT has_function_privilege('anon','public.krug_mark_settled_with_source(uuid,uuid,uuid,numeric,text,uuid,uuid,numeric,text)','EXECUTE')
    AND NOT has_function_privilege('anon','public.krug_confirm_settlement_receipt(uuid,uuid,uuid,numeric)','EXECUTE'));
  PERFORM pg_temp.ok('G12.4 authenticated smije',
    has_function_privilege('authenticated','public.krug_mark_settled_with_source(uuid,uuid,uuid,numeric,text,uuid,uuid,numeric,text)','EXECUTE')
    AND has_function_privilege('authenticated','public.krug_confirm_settlement_receipt(uuid,uuid,uuid,numeric)','EXECUTE'));
END $$;
