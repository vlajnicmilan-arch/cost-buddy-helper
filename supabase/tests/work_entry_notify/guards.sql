-- Čuvari W1–W4. Svaki je zaseban DO blok; ispisuje PASS Wn ili diže grešku.
-- Owner O, worker P, project K.
INSERT INTO public.projects (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Kasteli-test');
INSERT INTO public.profiles (user_id, display_name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Vlasnik Test'),
  ('00000000-0000-0000-0000-0000000000b1', 'Radnik Test');

-- W1: vlasnik upisuje sate povezanom radniku -> upis uspijeva, radnik dobiva obavijest.
DO $$
DECLARE v_w uuid; v_n int;
BEGIN
  INSERT INTO public.project_workers (project_id, user_id)
    VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1') RETURNING id INTO v_w;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  INSERT INTO public.project_work_entries (worker_id, project_id, work_date, actual_hours)
    VALUES (v_w, '00000000-0000-0000-0000-00000000000a', '2026-09-01', 8);
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE user_id = '00000000-0000-0000-0000-0000000000b1' AND type = 'work_entry_recorded'
     AND data->'message_vars'->>'actor' = 'Vlasnik Test';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL W1 notifications=%', v_n; END IF;
  -- radnik sam sebi: bez obavijesti
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  INSERT INTO public.project_work_entries (worker_id, project_id, work_date, actual_hours)
    VALUES (v_w, '00000000-0000-0000-0000-00000000000a', '2026-09-02', 8);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL W1 self-entry notified'; END IF;
  DELETE FROM public.project_work_entries; DELETE FROM public.notifications; DELETE FROM public.project_workers;
  RAISE NOTICE 'PASS W1';
END $$;

-- W2 + W3: link s postojećim dnevnicima -> backfilled = N; ponovni link ne duplira.
DO $$
DECLARE v_w uuid; r jsonb; v_n int; v_h numeric;
BEGIN
  INSERT INTO public.project_workers (project_id) VALUES ('00000000-0000-0000-0000-00000000000a') RETURNING id INTO v_w;
  INSERT INTO public.project_work_logs (project_id, user_id, log_date, hours) VALUES
    ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', '2026-09-12', 4),
    ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', '2026-09-14', 8),
    ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', '2026-09-21', 8),
    ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', '2026-09-22', NULL);
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  r := public.link_worker_to_member(v_w, '00000000-0000-0000-0000-0000000000b1');
  SELECT count(*), sum(actual_hours) INTO v_n, v_h FROM public.project_work_entries WHERE worker_id = v_w;
  IF (r->>'backfilled')::int <> 3 OR v_n <> 3 OR v_h <> 20 THEN
    RAISE EXCEPTION 'FAIL W2 backfilled=% rows=% hours=%', r->>'backfilled', v_n, v_h; END IF;
  RAISE NOTICE 'PASS W2';
  r := public.link_worker_to_member(v_w, '00000000-0000-0000-0000-0000000000b1');
  SELECT count(*), sum(actual_hours) INTO v_n, v_h FROM public.project_work_entries WHERE worker_id = v_w;
  IF v_n <> 3 OR v_h <> 20 THEN RAISE EXCEPTION 'FAIL W3 rows=% hours=%', v_n, v_h; END IF;
  DELETE FROM public.project_work_entries; DELETE FROM public.notifications;
  DELETE FROM public.project_work_logs; DELETE FROM public.project_workers;
  RAISE NOTICE 'PASS W3';
END $$;

-- W4: greška u dijelu obavijesti (nepostojeći projekt, akter bez profila,
-- tablica obavijesti odbija upis) ne ruši upis sati.
DO $$
DECLARE v_w uuid; v_n int;
BEGIN
  INSERT INTO public.project_workers (project_id, user_id)
    VALUES ('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000b1') RETURNING id INTO v_w;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c9', true);
  ALTER TABLE public.notifications ADD CONSTRAINT w4_block CHECK (false) NOT VALID;
  INSERT INTO public.project_work_entries (worker_id, project_id, work_date, actual_hours)
    VALUES (v_w, '00000000-0000-0000-0000-0000000000ff', '2026-09-03', 5);
  ALTER TABLE public.notifications DROP CONSTRAINT w4_block;
  SELECT count(*) INTO v_n FROM public.project_work_entries WHERE worker_id = v_w;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL W4 entries=%', v_n; END IF;
  DELETE FROM public.project_work_entries; DELETE FROM public.project_workers;
  RAISE NOTICE 'PASS W4';
END $$;
