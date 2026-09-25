-- Potvrda primitka isplate — čuvari. Svaki DO blok sam postavlja svijet.
-- vlasnik a1 (Petar), radnik b2 (Milan), treća osoba c3 (Ana).
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1','wpr.owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b2','wpr.worker@example.test'),
  ('00000000-0000-0000-0000-0000000000c3','wpr.third@example.test')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (user_id, display_name, preferred_language) VALUES
  ('00000000-0000-0000-0000-0000000000a1','Petar','hr'),
  ('00000000-0000-0000-0000-0000000000b2','Milan','hr'),
  ('00000000-0000-0000-0000-0000000000c3','Ana','hr')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.projects (id, user_id, name) VALUES
  ('11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Tajni Projekt');
INSERT INTO public.project_workers (id, project_id, user_id, first_name) VALUES
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','Milan');
INSERT INTO public.custom_payment_sources (id, user_id, name, balance, currency) VALUES
  ('33333333-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','Vlasnik EUR', 0, 'EUR'),
  ('33333333-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b2','Radnik EUR', 0, 'EUR'),
  ('33333333-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000b2','Radnik USD', 0, 'USD'),
  ('33333333-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000c3','Ana EUR', 0, 'EUR');

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
CREATE OR REPLACE FUNCTION pg_temp.raises(label text, sql text, expected text, expected_state text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text; v_state text;
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
    IF v_msg = expected AND (expected_state IS NULL OR v_state = expected_state) THEN
      RAISE NOTICE 'PASS % — % (%)', label, v_msg, v_state; RETURN; END IF;
    RAISE EXCEPTION 'FAIL % — expected "%"/%, got "%"/%', label, expected, expected_state, v_msg, v_state;
  END;
  RAISE EXCEPTION 'FAIL % — expected "%", call succeeded', label, expected;
END; $$;
-- Novi svijet: jedna isplata od 250 € iz vlasnikovog EUR izvora.
CREATE OR REPLACE FUNCTION pg_temp.reset(p_status text DEFAULT 'paid', p_src text DEFAULT 'custom:33333333-0000-0000-0000-00000000000a')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('app.allow_payout_write', 'on', false);
  DELETE FROM public.expenses WHERE user_id IN ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c3');
  DELETE FROM public.project_worker_payouts;
  UPDATE public.custom_payment_sources SET balance = 0;
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id, period_start, period_end,
    hours_covered, hourly_rate_snapshot, gross_amount, paid_amount, payment_source, paid_at, status, created_by)
  VALUES (v_id, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
    '2026-09-01', '2026-09-15', 10, 25, 250, 250, p_src, '2026-09-16 10:00+00', p_status,
    '00000000-0000-0000-0000-0000000000a1');
  PERFORM set_config('app.allow_payout_write', '', false);
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.call(p uuid, src text, crid uuid, amt text DEFAULT 'NULL') RETURNS text
LANGUAGE sql AS $$
  SELECT format('SELECT public.worker_confirm_payout_receipt(p_payout_id := %L, p_source_id := %L, p_client_request_id := %L, p_amount := %s)',
                p, src, crid, amt) $$;

-- R1: vlasnik i treća osoba dobivaju 42501.
DO $$
DECLARE v_p uuid := pg_temp.reset();
BEGIN
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.raises('R1.1 vlasnik ne smije', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000a', gen_random_uuid()), 'not_payout_recipient', '42501');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  PERFORM pg_temp.raises('R1.2 treća osoba ne smije', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000d', gen_random_uuid()), 'not_payout_recipient', '42501');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.raises('R1.3 bez prijave', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000b', gen_random_uuid()), 'unauthenticated', '42501');
END $$;

-- R2: povezani radnik → točno jedan prihod, ispravna polja, saldo +250.
DO $$
DECLARE v_p uuid := pg_temp.reset(); v_r jsonb; v_e record; v_before numeric;
BEGIN
  v_before := pg_temp.bal('33333333-0000-0000-0000-00000000000b');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  v_r := public.worker_confirm_payout_receipt(p_payout_id := v_p, p_source_id := '33333333-0000-0000-0000-00000000000b', p_client_request_id := 'aaaaaaaa-0000-0000-0000-000000000001');
  SELECT * INTO v_e FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000b2';
  PERFORM pg_temp.ok('R2.1 jedan prihod', (SELECT count(*) FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000b2') = 1, v_r::text);
  PERFORM pg_temp.ok('R2.2 polja', v_e.type='income' AND v_e.category='salary' AND v_e.status::text='approved'
    AND v_e.expense_nature IS NULL AND v_e.movement_kind IS NULL AND v_e.amount=250 AND v_e.worker_payout_id=v_p
    AND v_e.worker_payout_batch_id IS NULL AND v_e.payment_source='custom:33333333-0000-0000-0000-00000000000b'
    AND v_e.date = '2026-09-16 10:00+00' AND v_e.currency='EUR');
  PERFORM pg_temp.ok('R2.3 opis s imenom vlasnika, bez projekta', v_e.description = 'Isplata za rad — Petar'
    AND position('Tajni' in v_e.description) = 0, v_e.description);
  PERFORM pg_temp.ok('R2.4 saldo točno +250', pg_temp.bal('33333333-0000-0000-0000-00000000000b') - v_before = 250,
    pg_temp.bal('33333333-0000-0000-0000-00000000000b')::text);
  PERFORM pg_temp.ok('R2.5 vlasnikov saldo netaknut', pg_temp.bal('33333333-0000-0000-0000-00000000000a') = 0);
  -- R3: isti client_request_id → idempotent, bez drugog prihoda.
  v_r := public.worker_confirm_payout_receipt(p_payout_id := v_p, p_source_id := '33333333-0000-0000-0000-00000000000b', p_client_request_id := 'aaaaaaaa-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok('R3.1 idempotent', (v_r->>'idempotent')::boolean
    AND (SELECT count(*) FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000b2') = 1
    AND pg_temp.bal('33333333-0000-0000-0000-00000000000b') - v_before = 250, v_r::text);
  -- R4: druga potvrda (novi zahtjev) → already_confirmed.
  PERFORM pg_temp.raises('R4.1 already_confirmed', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000b', gen_random_uuid()), 'already_confirmed', '22023');
END $$;

-- R4.2: stari ručni pripis (prije RPC-a) također daje already_confirmed.
DO $$
DECLARE v_p uuid := pg_temp.reset();
BEGIN
  INSERT INTO public.expenses (user_id, type, amount, payment_source, category, worker_payout_id)
  VALUES ('00000000-0000-0000-0000-0000000000b2', 'income', 250, 'custom:33333333-0000-0000-0000-00000000000b', 'salary', v_p);
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('R4.2 stari pripis → already_confirmed', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000b', gen_random_uuid()), 'already_confirmed');
END $$;

-- R5: storno se odbija.
DO $$
DECLARE v_p uuid := pg_temp.reset('voided');
BEGIN
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('R5.1 storno', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000b', gen_random_uuid()), 'payout_voided', '22023');
  PERFORM pg_temp.ok('R5.2 bez upisa', (SELECT count(*) FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000b2') = 0);
END $$;

-- R6: druga valuta traži iznos; ista valuta ne prihvaća drugi iznos.
DO $$
DECLARE v_p uuid := pg_temp.reset(); v_r jsonb;
BEGIN
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('R6.1 USD bez iznosa', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000c', gen_random_uuid()), 'amount_required', '22023');
  PERFORM pg_temp.raises('R6.2 USD s 0', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000c', gen_random_uuid(), '0'), 'amount_required', '22023');
  PERFORM pg_temp.raises('R6.3 EUR s krivim iznosom', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000b', gen_random_uuid(), '999'), 'amount_mismatch', '22023');
  v_r := public.worker_confirm_payout_receipt(p_payout_id := v_p, p_source_id := '33333333-0000-0000-0000-00000000000c', p_client_request_id := gen_random_uuid(), p_amount := 290);
  PERFORM pg_temp.ok('R6.4 USD s iznosom → prihod 290 USD',
    (SELECT amount = 290 AND currency = 'USD' FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000b2')
    AND pg_temp.bal('33333333-0000-0000-0000-00000000000c') = 290, v_r::text);
END $$;

-- R7: tuđi novčanik se odbija.
DO $$
DECLARE v_p uuid := pg_temp.reset();
BEGIN
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('R7.1 tuđi novčanik', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000d', gen_random_uuid()), 'source_not_writable', '42501');
  PERFORM pg_temp.ok('R7.2 Anin saldo netaknut', pg_temp.bal('33333333-0000-0000-0000-00000000000d') = 0);
END $$;

-- R8: zbirna isplata → jedan zbirni prihod, zbroj iznosa, batch veza.
DO $$
DECLARE v_p uuid := pg_temp.reset(); v_b uuid := gen_random_uuid(); v_r jsonb;
BEGIN
  PERFORM set_config('app.allow_payout_write', 'on', false);
  UPDATE public.project_worker_payouts SET batch_id = v_b;
  INSERT INTO public.project_worker_payouts (project_id, worker_id, period_start, period_end,
    hours_covered, hourly_rate_snapshot, gross_amount, paid_amount, payment_source, paid_at, status, created_by, batch_id)
  VALUES ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
    '2026-09-16', '2026-09-30', 4, 25, 100, 100, 'custom:33333333-0000-0000-0000-00000000000a', '2026-09-16 10:00+00', 'paid',
    '00000000-0000-0000-0000-0000000000a1', v_b);
  PERFORM set_config('app.allow_payout_write', '', false);
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('R8.1 oba cilja', format('SELECT public.worker_confirm_payout_receipt(p_payout_id := %L, p_batch_id := %L, p_source_id := %L, p_client_request_id := %L)',
    v_p, v_b, '33333333-0000-0000-0000-00000000000b', gen_random_uuid()), 'exactly_one_target');
  v_r := public.worker_confirm_payout_receipt(p_batch_id := v_b, p_source_id := '33333333-0000-0000-0000-00000000000b', p_client_request_id := gen_random_uuid());
  PERFORM pg_temp.ok('R8.2 zbirni prihod 350 s batch vezom',
    (SELECT count(*) = 1 AND sum(amount) = 350 AND bool_and(worker_payout_batch_id = v_b AND worker_payout_id IS NULL)
       FROM public.expenses WHERE user_id='00000000-0000-0000-0000-0000000000b2'), v_r::text);
  PERFORM pg_temp.raises('R8.3 pojedinačna iz već potvrđene zbirne', pg_temp.call(v_p, '33333333-0000-0000-0000-00000000000b', gen_random_uuid()), 'already_confirmed');
END $$;

-- R9: client_request_id za drugu isplatu se odbija.
DO $$
DECLARE v_p uuid := pg_temp.reset(); v_q uuid;
BEGIN
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM public.worker_confirm_payout_receipt(p_payout_id := v_p, p_source_id := '33333333-0000-0000-0000-00000000000b', p_client_request_id := 'aaaaaaaa-0000-0000-0000-000000000009');
  PERFORM set_config('app.allow_payout_write', 'on', false);
  INSERT INTO public.project_worker_payouts (project_id, worker_id, period_start, period_end,
    hours_covered, hourly_rate_snapshot, gross_amount, paid_amount, payment_source, paid_at, status, created_by)
  VALUES ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
    '2026-10-01', '2026-10-15', 1, 25, 25, 25, 'cash', now(), 'paid', '00000000-0000-0000-0000-0000000000a1')
  RETURNING id INTO v_q;
  PERFORM set_config('app.allow_payout_write', '', false);
  PERFORM pg_temp.raises('R9.1 ponovljen client_request_id', pg_temp.call(v_q, '33333333-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000009'), 'client_request_id_reused');
END $$;

-- R10: prava — jedan oblik, anon/PUBLIC bez EXECUTE, authenticated s EXECUTE.
DO $$
BEGIN
  PERFORM pg_temp.ok('R10.1 jedan oblik funkcije',
    (SELECT count(*) FROM pg_proc WHERE proname='worker_confirm_payout_receipt' AND pronamespace='public'::regnamespace) = 1);
  PERFORM pg_temp.ok('R10.2 anon nema, authenticated ima',
    NOT has_function_privilege('anon','public.worker_confirm_payout_receipt(uuid,uuid,uuid,uuid,numeric)','EXECUTE')
    AND has_function_privilege('authenticated','public.worker_confirm_payout_receipt(uuid,uuid,uuid,uuid,numeric)','EXECUTE'));
  PERFORM pg_temp.ok('R10.3 PUBLIC nema',
    NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.proname='worker_confirm_payout_receipt' AND a.grantee = 0));
END $$;
