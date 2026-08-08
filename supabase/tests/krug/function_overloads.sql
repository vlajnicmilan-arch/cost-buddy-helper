-- Krug function overload guard.
--
-- 8.8.2026: dodavanje p_vars kreiralo je DRUGI overload
-- krug_emit_notification (7 vs 8 argumenata). Svaki postojeci poziv sa 7
-- argumenata postao je dvosmislen ("function is not unique") pa su SVE krug
-- radnje (prihvat pozivnice, odbijanje, krug_leave) padale u rollback.
--
-- Ovaj cuvar tvrdi da kljucne krug funkcije postoje u TOCNO JEDNOM obliku
-- i da prihvat pozivnice prolazi end-to-end.
--
-- Ocekivani parametri (psql -v):
--   krug_id, owner_id, invitee_id

\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('test.krug_id', :'krug_id', false),
       set_config('test.owner_id', :'owner_id', false),
       set_config('test.invitee_id', :'invitee_id', false);

DO $$
DECLARE
  v_name text;
  v_cnt  int;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'krug_emit_notification',
    'krug_accept_invitation',
    'krug_decline_invitation',
    'krug_revoke_invitation',
    'krug_leave',
    'krug_apply_act',
    'krug_override_propose',
    'krug_override_confirm',
    'krug_override_reject',
    'krug_override_withdraw'
  ] LOOP
    SELECT count(*) INTO v_cnt
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_cnt = 0 THEN
      RAISE NOTICE 'SKIP: % not present in harness', v_name;
    ELSIF v_cnt > 1 THEN
      RAISE EXCEPTION 'FAIL O1: % has % overloads (must be exactly 1)', v_name, v_cnt;
    ELSE
      RAISE NOTICE 'PASS O1: % has exactly one signature', v_name;
    END IF;
  END LOOP;
END $$;

-- Dokaz da cuvar hvata regresiju: namjerno dodamo drugi overload i
-- ocekujemo da provjera pukne.
DO $$
DECLARE
  v_cnt int;
BEGIN
  EXECUTE $fn$
    CREATE FUNCTION public.krug_emit_notification(
      p_event_type text, p_krug_id uuid, p_actor_id uuid, p_expense_id uuid,
      p_deletion_request_id uuid, p_dedup_ref text, p_recipient_override uuid[],
      p_vars jsonb, p_bogus int
    ) RETURNS void LANGUAGE sql AS 'SELECT NULL::void'
  $fn$;

  SELECT count(*) INTO v_cnt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'krug_emit_notification';

  IF v_cnt <= 1 THEN
    RAISE EXCEPTION 'FAIL O2: guard cannot detect duplicate overloads';
  END IF;
  RAISE NOTICE 'PASS O2: guard detects duplicate overload (count=%)', v_cnt;

  EXECUTE 'DROP FUNCTION public.krug_emit_notification(text,uuid,uuid,uuid,uuid,text,uuid[],jsonb,int)';
END $$;

-- Smoke: prihvat pozivnice mora proci end-to-end (dvosmislen poziv bi ovdje pukao).
DO $$
DECLARE
  v_krug    uuid := trim(both '''' from current_setting('test.krug_id'))::uuid;
  v_owner   uuid := trim(both '''' from current_setting('test.owner_id'))::uuid;
  v_invitee uuid := trim(both '''' from current_setting('test.invitee_id'))::uuid;
  v_inv     uuid;
  v_res     jsonb;
BEGIN
  DELETE FROM public.krug_membership WHERE krug_id = v_krug AND user_id = v_invitee;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  INSERT INTO public.krug_invitations (krug_id, email, invited_user_id, invited_by, role)
  VALUES (v_krug, 'invitee@example.test', v_invitee, v_owner, 'obicni')
  RETURNING id INTO v_inv;

  PERFORM set_config('request.jwt.claim.sub', v_invitee::text, true);
  v_res := public.krug_accept_invitation(v_inv, NULL);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL O3: accept failed: %', v_res;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.krug_membership
                  WHERE krug_id = v_krug AND user_id = v_invitee) THEN
    RAISE EXCEPTION 'FAIL O3b: membership missing after accept';
  END IF;
  RAISE NOTICE 'PASS O3: accept_invitation smoke ok';

  RAISE NOTICE 'ALL KRUG OVERLOAD CHECKS PASSED';
END $$;

ROLLBACK;
