-- „Nisam primio" — čuvari. vlasnik a1, radnik b2 (povezan), treća osoba c3.
INSERT INTO public.projects (id, user_id, name) VALUES
  ('11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Tajni Projekt');
INSERT INTO public.project_workers (id, project_id, user_id, first_name, last_name) VALUES
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','Milan','Horvat');
INSERT INTO public.custom_payment_sources VALUES ('33333333-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','EUR');

CREATE OR REPLACE FUNCTION pg_temp.ok(label text, cond boolean, detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(cond,false) THEN RAISE NOTICE 'PASS % %', label, detail;
  ELSE RAISE EXCEPTION 'FAIL % %', label, detail; END IF;
END; $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(u::text,''), false)::text::void $$;
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
CREATE OR REPLACE FUNCTION pg_temp.reset(p_status text DEFAULT 'paid', p_age interval DEFAULT '0') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  DELETE FROM public.worker_payout_receipt_reports;
  DELETE FROM public.krug_notify_outbox;
  DELETE FROM public.notifications;
  DELETE FROM public.expenses;
  DELETE FROM public.project_worker_payouts;
  DELETE FROM net.calls;
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id, paid_amount, status, payment_source, expense_id, created_at)
  VALUES (v_id, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 250, p_status,
          'custom:33333333-0000-0000-0000-00000000000a', '44444444-0000-0000-0000-000000000001', now() - p_age);
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.call(p uuid, crid uuid, note text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.worker_report_payout_not_received(p_client_request_id := %L, p_payout_id := %L, p_note := %L)', crid, p, note) $$;
CREATE OR REPLACE FUNCTION pg_temp.snap(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT row_to_json(pw)::text FROM public.project_worker_payouts pw WHERE id = p $$;

-- N1: samo povezani radnik.
DO $$
DECLARE v_p uuid := pg_temp.reset();
BEGIN
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.raises('N1.1 vlasnik ne smije', pg_temp.call(v_p, gen_random_uuid()), 'not_payout_recipient', '42501');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  PERFORM pg_temp.raises('N1.2 treća osoba ne smije', pg_temp.call(v_p, gen_random_uuid()), 'not_payout_recipient', '42501');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.raises('N1.3 bez prijave', pg_temp.call(v_p, gen_random_uuid()), 'unauthenticated', '42501');
  PERFORM pg_temp.ok('N1.4 nema prijave', (SELECT count(*) FROM public.worker_payout_receipt_reports) = 0);
END $$;

-- N2: radnik prijavljuje jednom; ponovni poziv idempotentan; vlasnik dobiva točno jednu obavijest i outbox red; isplata netaknuta.
DO $$
DECLARE v_p uuid := pg_temp.reset(); v_before text; r1 jsonb; r2 jsonb; r3 jsonb; v_c uuid := gen_random_uuid(); n jsonb;
BEGIN
  v_before := pg_temp.snap(v_p);
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  EXECUTE pg_temp.call(v_p, v_c, '  nije stiglo  ') INTO r1;
  EXECUTE pg_temp.call(v_p, v_c) INTO r2;
  EXECUTE pg_temp.call(v_p, gen_random_uuid()) INTO r3;
  PERFORM pg_temp.ok('N2.1 prvi poziv', (r1->>'ok')::boolean AND NOT (r1->>'idempotent')::boolean);
  PERFORM pg_temp.ok('N2.2 isti client_request_id idempotentan', (r2->>'idempotent')::boolean AND r2->>'report_id' = r1->>'report_id');
  PERFORM pg_temp.ok('N2.3 drugi zahtjev iste isplate idempotentan', (r3->>'idempotent')::boolean AND r3->>'report_id' = r1->>'report_id');
  PERFORM pg_temp.ok('N2.4 točno jedna prijava', (SELECT count(*) FROM public.worker_payout_receipt_reports) = 1);
  PERFORM pg_temp.ok('N2.5 napomena očišćena', (SELECT note FROM public.worker_payout_receipt_reports) = 'nije stiglo');
  PERFORM pg_temp.ok('N2.6 vlasnik ima točno jednu obavijest',
    (SELECT count(*) FROM public.notifications WHERE user_id='00000000-0000-0000-0000-0000000000a1' AND type='worker_payout_not_received') = 1);
  SELECT data INTO n FROM public.notifications WHERE type='worker_payout_not_received';
  PERFORM pg_temp.ok('N2.7 dedup i ruta na isplatu',
    (SELECT dedup_key FROM public.notifications WHERE type='worker_payout_not_received') = 'worker_payout_nr:' || v_p
    AND n->>'route' = '/projects?id=11111111-0000-0000-0000-000000000001'
    AND n->'highlight'->>'id' = '44444444-0000-0000-0000-000000000001'
    AND n->'message_vars'->>'worker' = 'Milan Horvat' AND n->'message_vars'->>'amount' = '250.00 EUR', n::text);
  PERFORM pg_temp.ok('N2.8 točno jedan outbox red source worker_payout',
    (SELECT count(*) FROM public.krug_notify_outbox WHERE dedup_ref = 'worker_payout_nr:' || v_p
       AND source='worker_payout' AND event_type='worker_payout_not_received') = 1);
  PERFORM pg_temp.ok('N2.9 prvi pokušaj pusha', (SELECT count(*) FROM net.calls WHERE body->>'outbox_dedup_ref' = 'worker_payout_nr:' || v_p) = 1);
  PERFORM pg_temp.ok('N2.10 isplata nepromijenjena', pg_temp.snap(v_p) = v_before);
  PERFORM pg_temp.ok('N2.11 radnik nema prihod', (SELECT count(*) FROM public.expenses) = 0);
END $$;

-- N3: potvrđena ili stornirana isplata vraća kod.
DO $$
DECLARE v_p uuid;
BEGIN
  v_p := pg_temp.reset('voided');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('N3.1 stornirana', pg_temp.call(v_p, gen_random_uuid()), 'payout_voided', '22023');
  v_p := pg_temp.reset();
  INSERT INTO public.expenses (user_id, worker_payout_id) VALUES ('00000000-0000-0000-0000-0000000000b2', v_p);
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM pg_temp.raises('N3.2 već potvrđena', pg_temp.call(v_p, gen_random_uuid()), 'already_confirmed', '22023');
  PERFORM pg_temp.raises('N3.3 duga napomena', pg_temp.call(v_p, gen_random_uuid(), repeat('x', 501)), 'note_too_long', '22023');
  PERFORM pg_temp.ok('N3.4 bez obavijesti vlasniku', (SELECT count(*) FROM public.notifications WHERE type='worker_payout_not_received') = 0);
END $$;

-- N4: kvar pusha ne ruši prijavu, ostavlja trag, outbox red ostaje za retry.
DO $$
DECLARE v_p uuid := pg_temp.reset(); r jsonb;
BEGIN
  PERFORM set_config('test.net_fail', '1', true);
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  EXECUTE pg_temp.call(v_p, gen_random_uuid()) INTO r;
  PERFORM set_config('test.net_fail', '', true);
  PERFORM pg_temp.ok('N4.1 prijava upisana', (r->>'ok')::boolean AND (SELECT count(*) FROM public.worker_payout_receipt_reports) = 1);
  PERFORM pg_temp.ok('N4.2 outbox red s greškom', (SELECT last_error FROM public.krug_notify_outbox WHERE dedup_ref='worker_payout_nr:'||v_p) IS NOT NULL);
  PERFORM pg_temp.ok('N4.3 trag u dijagnostici', EXISTS (SELECT 1 FROM public.app_diagnostics_logs
     WHERE event='worker_payout_notify_error' AND details->>'stage'='push' AND details->>'dedup_ref'='worker_payout_nr:'||v_p));
  UPDATE public.krug_notify_outbox SET created_at = now() - interval '10 minutes';
  PERFORM public.krug_notify_outbox_retry();
  PERFORM pg_temp.ok('N4.4 retry ponovno šalje', (SELECT count(*) FROM net.calls WHERE body->>'outbox_dedup_ref'='worker_payout_nr:'||v_p) = 1);
END $$;

-- N5: get_my_pending_payouts — samo nove, moje, nepotvrđene, neprijavljene, nestornirane.
DO $$
DECLARE v_new uuid; v_old uuid; v_conf uuid; v_rep uuid; v_void uuid; v_ids uuid[];
BEGIN
  v_new := pg_temp.reset();
  v_old := gen_random_uuid(); v_conf := gen_random_uuid(); v_rep := gen_random_uuid(); v_void := gen_random_uuid();
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id, paid_amount, status, created_at) VALUES
    (v_old,  '11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001', 10, 'paid', now() - interval '1 day'),
    (v_conf, '11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001', 10, 'paid', now()),
    (v_rep,  '11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001', 10, 'paid', now()),
    (v_void, '11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001', 10, 'voided', now());
  INSERT INTO public.expenses (user_id, worker_payout_id) VALUES ('00000000-0000-0000-0000-0000000000b2', v_conf);
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM public.worker_report_payout_not_received(gen_random_uuid(), v_rep);
  SELECT array_agg(payout_id) INTO v_ids FROM public.get_my_pending_payouts();
  PERFORM pg_temp.ok('N5.1 samo nova nepotvrđena', v_ids = ARRAY[v_new], COALESCE(v_ids::text,'null'));
  PERFORM pg_temp.ok('N5.2 valuta i projekt', (SELECT currency = 'EUR' AND project_name = 'Tajni Projekt' FROM public.get_my_pending_payouts()));
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.ok('N5.3 vlasnik ne vidi ništa', (SELECT count(*) FROM public.get_my_pending_payouts()) = 0);
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.ok('N5.4 bez prijave ništa', (SELECT count(*) FROM public.get_my_pending_payouts()) = 0);
END $$;

-- N6: zbirna isplata — jedna prijava za batch; pojedinačna iz iste zbirne je already_reported.
DO $$
DECLARE v_b uuid := gen_random_uuid(); v_p1 uuid := gen_random_uuid(); r jsonb;
BEGIN
  PERFORM pg_temp.reset();
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id, paid_amount, batch_id) VALUES
    (v_p1, '11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001', 10, v_b),
    (gen_random_uuid(), '11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001', 15, v_b);
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  r := public.worker_report_payout_not_received(gen_random_uuid(), NULL, v_b);
  PERFORM pg_temp.ok('N6.1 batch prijava', (r->>'ok')::boolean AND (SELECT amount FROM public.worker_payout_receipt_reports WHERE batch_id = v_b) = 25);
  PERFORM pg_temp.raises('N6.2 pojedinačna iz prijavljene zbirne', pg_temp.call(v_p1, gen_random_uuid()), 'already_reported', '22023');
  PERFORM pg_temp.raises('N6.3 oba cilja', format('SELECT public.worker_report_payout_not_received(%L, %L, %L)', gen_random_uuid(), v_p1, v_b), 'exactly_one_target', '22023');
END $$;

-- N7: RLS na tablici prijava.
DO $$
DECLARE v_p uuid := pg_temp.reset();
BEGIN
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM public.worker_report_payout_not_received(gen_random_uuid(), v_p);
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
DO $$ BEGIN PERFORM pg_temp.ok('N7.1 radnik čita svoju', (SELECT count(*) FROM public.worker_payout_receipt_reports) = 1); END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
DO $$ BEGIN PERFORM pg_temp.ok('N7.2 vlasnik čita za svoj projekt', (SELECT count(*) FROM public.worker_payout_receipt_reports) = 1); END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
DO $$ BEGIN PERFORM pg_temp.ok('N7.3 treća osoba ne vidi', (SELECT count(*) FROM public.worker_payout_receipt_reports) = 0); END $$;
DO $$ BEGIN
  PERFORM pg_temp.raises('N7.4 izravan upis zabranjen',
    $q$INSERT INTO public.worker_payout_receipt_reports (payout_id, payout_ids, worker_user_id, owner_user_id, project_id, amount, client_request_id)
       VALUES (gen_random_uuid(), '{}', '00000000-0000-0000-0000-0000000000c3', gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid())$q$,
    'permission denied for table worker_payout_receipt_reports', '42501');
END $$;
RESET ROLE;

-- N8: prava.
DO $$
BEGIN
  PERFORM pg_temp.ok('N8.1 anon ne smije prijaviti', NOT has_function_privilege('anon', 'public.worker_report_payout_not_received(uuid,uuid,uuid,text)', 'EXECUTE'));
  PERFORM pg_temp.ok('N8.2 authenticated smije prijaviti', has_function_privilege('authenticated', 'public.worker_report_payout_not_received(uuid,uuid,uuid,text)', 'EXECUTE'));
  PERFORM pg_temp.ok('N8.3 anon ne smije čekanje', NOT has_function_privilege('anon', 'public.get_my_pending_payouts()', 'EXECUTE'));
  PERFORM pg_temp.ok('N8.4 authenticated smije čekanje', has_function_privilege('authenticated', 'public.get_my_pending_payouts()', 'EXECUTE'));
  PERFORM pg_temp.ok('N8.5 anon bez prava na tablicu', NOT has_table_privilege('anon', 'public.worker_payout_receipt_reports', 'SELECT,INSERT,UPDATE,DELETE'));
  PERFORM pg_temp.ok('N8.6 authenticated samo čita', has_table_privilege('authenticated', 'public.worker_payout_receipt_reports', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.worker_payout_receipt_reports', 'INSERT,UPDATE,DELETE'));
  PERFORM pg_temp.ok('N8.7 RLS uključen', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.worker_payout_receipt_reports'::regclass));
END $$;
