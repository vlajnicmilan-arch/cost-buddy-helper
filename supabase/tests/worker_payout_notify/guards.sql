-- Radnici: obavijest o isplati — čuvari. Svaki DO blok sam postavlja svijet.
CREATE OR REPLACE FUNCTION pg_temp.ok(label text, cond boolean, detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(cond,false) THEN RAISE NOTICE 'PASS % %', label, detail;
  ELSE RAISE EXCEPTION 'FAIL % %', label, detail; END IF;
END; $$;

INSERT INTO public.projects VALUES ('11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Kuća');
INSERT INTO public.project_workers (id, project_id, user_id) VALUES
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2'),
  ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001', NULL);

CREATE OR REPLACE FUNCTION pg_temp.reset() RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.notifications; DELETE FROM public.krug_notify_outbox;
  DELETE FROM public.app_diagnostics_logs; DELETE FROM net.calls; DELETE FROM public.project_worker_payouts;
  SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
  SELECT set_config('test.net_fail', '0', false);
$$;

-- WP1: pojedinačna isplata povezanom radniku → točno jedna obavijest, outbox red, prvi pokušaj pusha.
DO $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM pg_temp.reset();
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id)
  VALUES (v_id, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok('WP1.1 jedna obavijest radniku',
    (SELECT count(*) FROM public.notifications WHERE user_id='00000000-0000-0000-0000-0000000000b2'
       AND type='worker_payout_created' AND dedup_key='worker_payout:'||v_id||':created') = 1);
  PERFORM pg_temp.ok('WP1.2 outbox red source=worker_payout',
    (SELECT count(*) FROM public.krug_notify_outbox WHERE dedup_ref='worker_payout:'||v_id||':created'
       AND source='worker_payout' AND attempts=1) = 1);
  PERFORM pg_temp.ok('WP1.3 prvi pokušaj pusha poslan',
    (SELECT count(*) FROM net.calls WHERE url LIKE '%/notify-worker-payout'
       AND body->>'outbox_dedup_ref'='worker_payout:'||v_id||':created') = 1);
END $$;

-- WP2: storno → točno jedna obavijest voided.
DO $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM pg_temp.reset();
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id)
  VALUES (v_id, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001');
  UPDATE public.project_worker_payouts SET status='voided' WHERE id=v_id;
  UPDATE public.project_worker_payouts SET status='voided' WHERE id=v_id;
  PERFORM pg_temp.ok('WP2.1 jedna obavijest o stornu',
    (SELECT count(*) FROM public.notifications WHERE type='worker_payout_voided') = 1);
  PERFORM pg_temp.ok('WP2.2 outbox red za storno',
    (SELECT count(*) FROM public.krug_notify_outbox WHERE dedup_ref='worker_payout:'||v_id||':voided') = 1);
END $$;

-- WP3: nepovezani radnik → ništa, bez greške.
DO $$
BEGIN
  PERFORM pg_temp.reset();
  INSERT INTO public.project_worker_payouts (project_id, worker_id)
  VALUES ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');
  PERFORM pg_temp.ok('WP3.1 nepovezani: bez obavijesti, outboxa i greške',
    (SELECT count(*) FROM public.notifications) = 0
    AND (SELECT count(*) FROM public.krug_notify_outbox) = 0
    AND (SELECT count(*) FROM public.app_diagnostics_logs) = 0);
END $$;

-- WP4: zbirni put (suppress + jedan enqueue) i ponovljeni enqueue → nema dvostruke obavijesti.
DO $$
DECLARE v_b uuid := gen_random_uuid(); v_a uuid := gen_random_uuid(); v_c uuid := gen_random_uuid();
BEGIN
  PERFORM pg_temp.reset();
  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '1', true);
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id, batch_id) VALUES
    (v_a, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', v_b),
    (v_c, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', v_b);
  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '0', true);
  PERFORM public.enqueue_worker_payout_notifications(ARRAY[v_a, v_c], 'created',
    '00000000-0000-0000-0000-0000000000a1', v_b);
  PERFORM public.enqueue_worker_payout_notifications(ARRAY[v_a, v_c], 'created',
    '00000000-0000-0000-0000-0000000000a1', v_b);
  PERFORM pg_temp.ok('WP4.1 zbirna: jedna obavijest s batch ključem',
    (SELECT count(*) FROM public.notifications WHERE dedup_key='worker_payout:'||v_b||':created') = 1
    AND (SELECT count(*) FROM public.notifications) = 1);
  PERFORM pg_temp.ok('WP4.2 zbirna: jedan outbox red',
    (SELECT count(*) FROM public.krug_notify_outbox) = 1);
END $$;

-- WP5: kvar pusha ne ruši isplatu, obavijest u aplikaciji ostaje, trag postoji.
DO $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM pg_temp.reset();
  PERFORM set_config('test.net_fail', '1', false);
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id)
  VALUES (v_id, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok('WP5.1 isplata je upisana', EXISTS (SELECT 1 FROM public.project_worker_payouts WHERE id=v_id));
  PERFORM pg_temp.ok('WP5.2 obavijest u aplikaciji ostaje', (SELECT count(*) FROM public.notifications) = 1);
  PERFORM pg_temp.ok('WP5.3 worker_payout_notify_error s payout_id, bez iznosa',
    (SELECT count(*) FROM public.app_diagnostics_logs WHERE event='worker_payout_notify_error'
       AND details->>'payout_id' = v_id::text AND details->>'code' IS NOT NULL
       AND app_version LIKE 'enqueue_worker_payout_notifications@%'
       AND NOT (details ? 'amount') AND NOT (details ? 'paid_amount')) = 1);
  PERFORM pg_temp.ok('WP5.4 outbox red preživio kvar pusha (retry ga preuzima)',
    (SELECT count(*) FROM public.krug_notify_outbox WHERE dedup_ref='worker_payout:'||v_id||':created'
       AND last_error IS NOT NULL) = 1);
  PERFORM set_config('test.net_fail', '0', false);
END $$;

-- WP6: kvar upisa obavijesti ne ruši isplatu i ostavlja trag.
DO $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM pg_temp.reset();
  ALTER TABLE public.notifications ADD CONSTRAINT wp6_block CHECK (type <> 'worker_payout_created') NOT VALID;
  INSERT INTO public.project_worker_payouts (id, project_id, worker_id)
  VALUES (v_id, '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001');
  ALTER TABLE public.notifications DROP CONSTRAINT wp6_block;
  PERFORM pg_temp.ok('WP6.1 isplata upisana unatoč kvaru obavijesti',
    EXISTS (SELECT 1 FROM public.project_worker_payouts WHERE id=v_id));
  PERFORM pg_temp.ok('WP6.2 trag stage=in_app',
    (SELECT count(*) FROM public.app_diagnostics_logs WHERE event='worker_payout_notify_error'
       AND details->>'stage'='in_app' AND details->>'payout_id'=v_id::text) = 1);
END $$;

-- WP7: retry ponovno šalje stari neisporučeni worker_payout red kroz notify-worker-payout;
-- isporučeni i krug redovi idu svojim putem.
DO $$
DECLARE v_sent int;
BEGIN
  PERFORM pg_temp.reset();
  INSERT INTO public.krug_notify_outbox (dedup_ref, event_type, payload, attempts, created_at, source, delivered_at) VALUES
    ('worker_payout:old:created', 'worker_payout_created', '{}', 1, now() - interval '10 minutes', 'worker_payout', NULL),
    ('worker_payout:done:created', 'worker_payout_created', '{}', 1, now() - interval '10 minutes', 'worker_payout', now()),
    ('worker_payout:max:created', 'worker_payout_created', '{}', 5, now() - interval '10 minutes', 'worker_payout', NULL);
  v_sent := public.krug_notify_outbox_retry();
  PERFORM pg_temp.ok('WP7.1 retry poslao točno stari red', v_sent = 1
    AND (SELECT count(*) FROM net.calls WHERE body->>'outbox_dedup_ref'='worker_payout:old:created') = 1
    AND (SELECT attempts FROM public.krug_notify_outbox WHERE dedup_ref='worker_payout:old:created') = 2, v_sent::text);
  PERFORM pg_temp.ok('WP7.2 nakon 5 pokušaja worker_payout_notify_failed',
    (SELECT count(*) FROM public.app_diagnostics_logs WHERE event='worker_payout_notify_failed'
       AND details->>'dedup_ref'='worker_payout:max:created') = 1);
END $$;

-- WP8: prava zatvorena (stvarni poziv pod ulogom).
DO $$
DECLARE r text; f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH f IN ARRAY ARRAY[
      'SELECT public._worker_payout_push_http(''x'')',
      'SELECT public.enqueue_worker_payout_notifications(ARRAY[gen_random_uuid()], ''created'', NULL, NULL)',
      'SELECT public.krug_notify_outbox_retry()',
      'SELECT public.krug_notify_outbox_mark_delivered(''x'')',
      'SELECT count(*) FROM public.krug_notify_outbox'] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', r);
        EXECUTE f;
        RESET ROLE;
        RAISE EXCEPTION 'FAIL WP8 % smije: %', r, f;
      EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS WP8.1 anon/authenticated: permission denied na push, enqueue, retry, mark i outbox';
  PERFORM pg_temp.ok('WP8.2 service_role smije push i enqueue',
    has_function_privilege('service_role','public._worker_payout_push_http(text)','EXECUTE')
    AND has_function_privilege('service_role','public.enqueue_worker_payout_notifications(uuid[],text,uuid,uuid)','EXECUTE'));
END $$;
