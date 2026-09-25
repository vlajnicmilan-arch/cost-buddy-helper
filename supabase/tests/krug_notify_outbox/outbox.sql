-- Krug outbox — čuvari. Svaki čuvar je zaseban DO blok i sam postavlja svijet.
-- U bacivoj bazi nema vault ključa ni net produkcije: emit pada u EXCEPTION
-- granu, što je upravo scenarij koji čuvamo (obavijest ne ruši čin + trag).

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
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1')
ON CONFLICT DO NOTHING;
INSERT INTO public.krug_membership VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b2','punopravni'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c3','punopravni')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.ok(label text, cond boolean, detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(cond,false) THEN RAISE NOTICE 'PASS % %', label, detail;
  ELSE RAISE EXCEPTION 'FAIL % %', label, detail; END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(u::text,''), false)::text::void $$;

CREATE OR REPLACE FUNCTION pg_temp.new_proposal(author uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.expenses (id, user_id, amount, currency, type, date, description,
    krug_id, krug_privacy, krug_shared_status)
  VALUES (v_id, author, 10, 'EUR', 'expense', now(), 'outbox harness',
    '11111111-1111-1111-1111-111111111111', 'shared', 'predlozena');
  RETURN v_id;
END; $$;

-- O1: A1 upisuje točno jedan outbox red po novom činu; čin prolazi i kad emit
-- padne (u bacivoj bazi nema vault ključa → EXCEPTION grana).
DO $$
DECLARE v_exp uuid; v_res jsonb; v_cnt int;
BEGIN
  DELETE FROM public.krug_notify_outbox;
  DELETE FROM public.krug_act_dedup;
  v_exp := pg_temp.new_proposal('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  v_res := public.krug_apply_act(v_exp, 'A1', 'req-o1');
  PERFORM pg_temp.ok('O1.1 čin je prošao unatoč kvaru emita', v_res->>'outcome' = 'ok_confirmed', v_res::text);
  SELECT count(*) INTO v_cnt FROM public.krug_notify_outbox
   WHERE dedup_ref LIKE 'krug_expense_confirmed:act:%';
  PERFORM pg_temp.ok('O1.2 točno jedan outbox red za A1', v_cnt = 1, v_cnt::text);
  PERFORM pg_temp.as_user(NULL);
END $$;

-- O2: ponovljeni client_request_id ne upisuje novi outbox red.
DO $$
DECLARE v_exp uuid; v_res jsonb; v_cnt int;
BEGIN
  DELETE FROM public.krug_notify_outbox;
  DELETE FROM public.krug_act_dedup;
  v_exp := pg_temp.new_proposal('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  PERFORM public.krug_apply_act(v_exp, 'A1', 'req-o2');
  v_res := public.krug_apply_act(v_exp, 'A1', 'req-o2');
  PERFORM pg_temp.ok('O2.1 ponovljivi poziv je replay', (v_res->>'replayed')::boolean, v_res::text);
  SELECT count(*) INTO v_cnt FROM public.krug_notify_outbox
   WHERE dedup_ref LIKE 'krug_expense_confirmed:act:%';
  PERFORM pg_temp.ok('O2.2 i dalje točno jedan outbox red', v_cnt = 1, v_cnt::text);
  PERFORM pg_temp.as_user(NULL);
END $$;

-- O3: A2 (odbijanje s razlogom) upisuje svoj outbox red i ne ruši se na emitu.
DO $$
DECLARE v_exp uuid; v_res jsonb; v_cnt int;
BEGIN
  DELETE FROM public.krug_notify_outbox;
  DELETE FROM public.krug_act_dedup;
  v_exp := pg_temp.new_proposal('00000000-0000-0000-0000-0000000000a1');
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  v_res := public.krug_apply_act(v_exp, 'A2', 'req-o3', 'krivi iznos');
  PERFORM pg_temp.ok('O3.1 odbijanje je prošlo', v_res->>'outcome' = 'ok_negated', v_res::text);
  SELECT count(*) INTO v_cnt FROM public.krug_notify_outbox
   WHERE dedup_ref LIKE 'krug_expense_rejected:act:%';
  PERFORM pg_temp.ok('O3.2 točno jedan outbox red za A2', v_cnt = 1, v_cnt::text);
  PERFORM pg_temp.as_user(NULL);
END $$;

-- O4: podmirenje upisuje outbox red i ne ruši se na emitu.
DO $$
DECLARE v_res jsonb; v_cnt int;
BEGIN
  DELETE FROM public.krug_notify_outbox;
  INSERT INTO public.custom_payment_sources (id, user_id, name, balance, currency) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Petar Revolut',0,'EUR'),
    ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','Milan Tekući',0,'EUR')
  ON CONFLICT DO NOTHING;
  PERFORM pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  v_res := public.krug_mark_settled_with_source(
    '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 20, 'EUR',
    'aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000d1', NULL, NULL);
  PERFORM pg_temp.ok('O4.1 podmirenje je prošlo', (v_res->>'ok')::boolean, v_res::text);
  SELECT count(*) INTO v_cnt FROM public.krug_notify_outbox
   WHERE dedup_ref LIKE 'settled:%';
  PERFORM pg_temp.ok('O4.2 outbox red za podmirenje postoji', v_cnt = 1, v_cnt::text);
  PERFORM pg_temp.as_user(NULL);
END $$;

-- O5: retry posao preskače isporučene redove i one s attempts >= 5, a za
-- konačno neuspjele upisuje krug_emit_failed točno jednom.
DO $$
DECLARE v_sent int; v_failed int;
BEGIN
  DELETE FROM public.krug_notify_outbox;
  INSERT INTO public.krug_notify_outbox (dedup_ref, event_type, payload, attempts, delivered_at, created_at) VALUES
    ('t:delivered', 'krug_expense_confirmed', '{}', 1, now(), now() - interval '1 hour'),
    ('t:maxed',     'krug_expense_confirmed', '{}', 5, NULL, now() - interval '1 hour'),
    ('t:fresh',     'krug_expense_confirmed', '{}', 0, NULL, now());
  v_sent := public.krug_notify_outbox_retry();
  PERFORM pg_temp.ok('O5.1 retry ne dira svježe redove', v_sent = 0, v_sent::text);
  PERFORM pg_temp.ok('O5.2 isporučeni i maxed redovi netaknuti',
    (SELECT attempts FROM public.krug_notify_outbox WHERE dedup_ref='t:delivered') = 1
    AND (SELECT attempts FROM public.krug_notify_outbox WHERE dedup_ref='t:maxed') = 5);
  SELECT count(*) INTO v_failed FROM public.app_diagnostics_logs
   WHERE event = 'krug_emit_failed' AND details->>'dedup_ref' = 't:maxed';
  PERFORM pg_temp.ok('O5.3 krug_emit_failed zapisan jednom', v_failed = 1, v_failed::text);
  PERFORM public.krug_notify_outbox_retry();
  SELECT count(*) INTO v_failed FROM public.app_diagnostics_logs
   WHERE event = 'krug_emit_failed' AND details->>'dedup_ref' = 't:maxed';
  PERFORM pg_temp.ok('O5.4 krug_emit_failed se ne ponavlja', v_failed = 1, v_failed::text);
END $$;

-- O6: emit ostavlja trag greške u app_diagnostics_logs (u bacivoj bazi vault
-- ključ nedostaje ili schema ne postoji → code vault_key_missing ili SQLSTATE).
DO $$
DECLARE v_cnt int;
BEGIN
  DELETE FROM public.app_diagnostics_logs WHERE event = 'krug_emit_error';
  PERFORM public.krug_emit_notification('krug_expense_confirmed',
    '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b2', NULL, NULL, 't:diag', NULL, NULL);
  SELECT count(*) INTO v_cnt FROM public.app_diagnostics_logs
   WHERE event = 'krug_emit_error' AND details->>'dedup_ref' = 't:diag';
  PERFORM pg_temp.ok('O6.1 krug_emit_error zapisan', v_cnt = 1, v_cnt::text);
END $$;

-- O7: prava — outbox i nove funkcije nisu dostupni korisnicima.
DO $$
BEGIN
  PERFORM pg_temp.ok('O7.1 anon/authenticated bez EXECUTE na retry i mark_delivered',
    NOT has_function_privilege('anon','public.krug_notify_outbox_retry()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.krug_notify_outbox_retry()','EXECUTE')
    AND NOT has_function_privilege('anon','public.krug_notify_outbox_mark_delivered(text)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.krug_notify_outbox_mark_delivered(text)','EXECUTE'));
  PERFORM pg_temp.ok('O7.2 authenticated bez prava na tablicu outbox',
    NOT has_table_privilege('authenticated','public.krug_notify_outbox','SELECT')
    AND NOT has_table_privilege('anon','public.krug_notify_outbox','SELECT'));
END $$;

-- O8: retry ponovno šalje star neisporučen red kroz _krug_emit_http (attempts +1),
-- jedan oblik funkcije, _krug_emit_http nedostupan korisnicima.
DO $$
DECLARE v_sent int;
BEGIN
  DELETE FROM public.krug_notify_outbox;
  INSERT INTO public.krug_notify_outbox (dedup_ref, event_type, payload, attempts, created_at) VALUES
    ('t:old', 'krug_expense_confirmed',
     '{"krug_id":"11111111-1111-1111-1111-111111111111","actor_id":"00000000-0000-0000-0000-0000000000b2","recipient_override":["00000000-0000-0000-0000-0000000000a1"],"vars":null}',
     1, now() - interval '10 minutes');
  v_sent := public.krug_notify_outbox_retry();
  PERFORM pg_temp.ok('O8.1 retry je pokušao stari red',
    (SELECT attempts FROM public.krug_notify_outbox WHERE dedup_ref='t:old') = 2);
  PERFORM pg_temp.ok('O8.2 jedan oblik krug_emit_notification i _krug_emit_http',
    (SELECT count(*) FROM pg_proc WHERE proname='krug_emit_notification') = 1
    AND (SELECT count(*) FROM pg_proc WHERE proname='_krug_emit_http') = 1);
  PERFORM pg_temp.ok('O8.3 anon/authenticated bez EXECUTE na _krug_emit_http',
    NOT has_function_privilege('anon','public._krug_emit_http(text,uuid,uuid,uuid,uuid,text,uuid[],jsonb)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public._krug_emit_http(text,uuid,uuid,uuid,uuid,text,uuid[],jsonb)','EXECUTE'));
END $$;

-- O9: stvarni poziv pod ulogom — anon/authenticated dobivaju permission denied,
-- service_role smije. Isto za tablicu i ostale outbox funkcije.
DO $$
DECLARE r text; f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH f IN ARRAY ARRAY[
      'SELECT public.krug_notify_outbox_mark_delivered(''t:x'')',
      'SELECT public.krug_notify_outbox_retry()',
      'SELECT public._krug_emit_http(''e'',NULL,NULL)',
      'SELECT public.krug_emit_notification(''e'',NULL,NULL)',
      'SELECT count(*) FROM public.krug_notify_outbox',
      'UPDATE public.krug_notify_outbox SET delivered_at = now()'] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', r);
        EXECUTE f;
        RESET ROLE;
        RAISE EXCEPTION 'FAIL O9 % smije: %', r, f;
      EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS O9.1 anon/authenticated: permission denied na sve outbox funkcije i tablicu';
  SET LOCAL ROLE service_role;
  PERFORM public.krug_notify_outbox_mark_delivered('t:x');
  RESET ROLE;
  RAISE NOTICE 'PASS O9.2 service_role smije mark_delivered';
END $$;
