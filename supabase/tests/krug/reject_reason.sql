-- Krug A2 (odbijanje) — OBAVEZAN razlog.
--
-- Cuvar za pravilo: odbijanje tudjeg troska je poruka autoru o zajednickom
-- novcu. Prazan razlog server MORA odbiti (ne samo UI), razlog se sprema uz
-- trosak i putuje u obavijest (`vars.reason`).
--
-- Rollback-safe: cijeli scenarij je u BEGIN ... ROLLBACK.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f supabase/tests/krug/reject_reason.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_author uuid;
  v_viewer uuid;
  v_krug uuid;
  v_exp uuid;
  v_res jsonb;
  v_status text;
  v_reason text;
  v_cnt int;
BEGIN
  -- Harness role nema pristup auth schemi; koristimo dva postojeca korisnika
  -- (FK expenses.user_id -> auth.users). Sve se rollbacka.
  SELECT a[1], a[2] INTO v_author, v_viewer
    FROM (SELECT array_agg(user_id) a FROM (
            SELECT DISTINCT user_id FROM public.expenses WHERE user_id IS NOT NULL LIMIT 2
          ) x) y;
  IF v_author IS NULL OR v_viewer IS NULL OR v_author = v_viewer THEN
    RAISE EXCEPTION 'SETUP: nema dva korisnika za harness';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_viewer::text, true);

  INSERT INTO public.krug (name, preset, created_by)
  VALUES ('reject-reason-harness', 'partner', v_viewer)
  RETURNING id INTO v_krug;

  INSERT INTO public.krug_ownership (krug_id, user_id) VALUES (v_krug, v_viewer);
  INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
  VALUES (v_krug, v_viewer, 'punopravni', v_viewer),
         (v_krug, v_author, 'punopravni', v_viewer)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.expenses (user_id, amount, description, date, type, category,
                               krug_id, krug_privacy, krug_shared_status)
  VALUES (v_author, 100, 'harness shared expense', current_date, 'expense', 'other',
          v_krug, 'shared', 'predlozena')
  RETURNING id INTO v_exp;

  -- R1: A2 bez razloga MORA pasti na serveru.
  v_res := public.krug_apply_act(v_exp, 'A2', gen_random_uuid()::text, NULL);
  IF v_res->>'outcome' <> 'reason_required' THEN
    RAISE EXCEPTION 'FAIL R1: A2 bez razloga vratio %', v_res;
  END IF;
  RAISE NOTICE 'PASS R1: A2 bez razloga odbijen (reason_required)';

  -- R1b: samo bjelina je i dalje prazan razlog.
  v_res := public.krug_apply_act(v_exp, 'A2', gen_random_uuid()::text, '   ');
  IF v_res->>'outcome' <> 'reason_required' THEN
    RAISE EXCEPTION 'FAIL R1b: prazan razlog prosao %', v_res;
  END IF;
  RAISE NOTICE 'PASS R1b: razlog od samih razmaka odbijen';

  SELECT krug_shared_status::text INTO v_status FROM public.expenses WHERE id = v_exp;
  IF v_status <> 'predlozena' THEN
    RAISE EXCEPTION 'FAIL R2: status promijenjen bez razloga (%)', v_status;
  END IF;
  RAISE NOTICE 'PASS R2: status ostao predlozena';

  -- R3: A2 s razlogom prolazi i sprema razlog uz trosak.
  v_res := public.krug_apply_act(v_exp, 'A2', gen_random_uuid()::text, 'nije zajednicki trosak');
  IF v_res->>'outcome' <> 'ok_negated' THEN
    RAISE EXCEPTION 'FAIL R3: A2 s razlogom vratio %', v_res;
  END IF;
  SELECT krug_shared_status::text, krug_reject_reason INTO v_status, v_reason
    FROM public.expenses WHERE id = v_exp;
  IF v_status <> 'nepotvrdjena' OR v_reason <> 'nije zajednicki trosak' THEN
    RAISE EXCEPTION 'FAIL R3: status=% reason=%', v_status, v_reason;
  END IF;
  RAISE NOTICE 'PASS R3: odbijeno uz spremljen razlog';

  -- R4: razlog putuje u obavijest autoru.
  SELECT count(*) INTO v_cnt
    FROM public.notifications
   WHERE user_id = v_author
     AND type = 'krug_expense_rejected'
     AND coalesce(title_vars->>'reason', message_vars->>'reason') = 'nije zajednicki trosak';
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'FAIL R4: razlog nije stigao u obavijest (% redaka)', v_cnt;
  END IF;
  RAISE NOTICE 'PASS R4: obavijest sadrzi razlog';

  -- R5: A5 (ponovni prijedlog) cisti stari razlog.
  PERFORM set_config('request.jwt.claim.sub', v_author::text, true);
  v_res := public.krug_apply_act(v_exp, 'A5', gen_random_uuid()::text, NULL);
  IF v_res->>'outcome' <> 'ok_reproposed' THEN
    RAISE EXCEPTION 'FAIL R5: A5 vratio %', v_res;
  END IF;
  SELECT krug_reject_reason INTO v_reason FROM public.expenses WHERE id = v_exp;
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL R5: razlog nije ocisten (%)', v_reason;
  END IF;
  RAISE NOTICE 'PASS R5: ponovni prijedlog cisti razlog';
END $$;

ROLLBACK;
