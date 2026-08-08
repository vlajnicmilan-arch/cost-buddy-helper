-- Krug self-leave guard — asimetricni samoizlazak (governance pravilo).
--
-- Dokazuje:
--   1) clan koji NIJE vlasnik moze sam izaci kroz `krug_leave`
--   2) ponovljeni poziv je idempotentan (`noop_not_member`)
--   3) vlasnik NE moze izaci kroz `krug_leave` (`owner_cannot_leave`)
--   4) izlazak NE dira zapise razracunavanja
--   5) izasli clan nema vise READ ni WRITE na krug clanstvo (RLS)
--   6) direktan DELETE samog sebe i dalje pada (0 redaka) — izlazak ide
--      iskljucivo kroz SECURITY DEFINER RPC
--   7) audit zapis `member_left` postoji i append-only je (UPDATE/DELETE padaju)
--
-- Skripta je rollback-safe (BEGIN ... ROLLBACK na kraju).
--
-- Usage:
--   psql ... -v krug_id="'<uuid>'" -v owner_id="'<uuid>'" \
--            -v member_id="'<uuid>'" -f supabase/tests/krug/member_leave.sql

\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('test.krug_id', :'krug_id', false),
       set_config('test.owner_id', :'owner_id', false),
       set_config('test.member_id', :'member_id', false);

-- Pripremi clanstvo (zaobilazi consent trigger namjerno — fixture, ne test).
ALTER TABLE public.krug_membership DISABLE TRIGGER USER;
INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
SELECT trim(both '''' from current_setting('test.krug_id'))::uuid,
       trim(both '''' from current_setting('test.member_id'))::uuid,
       'punopravni',
       trim(both '''' from current_setting('test.owner_id'))::uuid
ON CONFLICT DO NOTHING;
ALTER TABLE public.krug_membership ENABLE TRIGGER USER;

INSERT INTO public.krug_settlement_ledger (krug_id, from_user, to_user, amount)
VALUES (
  trim(both '''' from current_setting('test.krug_id'))::uuid,
  trim(both '''' from current_setting('test.member_id'))::uuid,
  trim(both '''' from current_setting('test.owner_id'))::uuid,
  42.50
);

DO $$
DECLARE
  v_krug uuid := trim(both '''' from current_setting('test.krug_id'))::uuid;
  v_owner uuid := trim(both '''' from current_setting('test.owner_id'))::uuid;
  v_member uuid := trim(both '''' from current_setting('test.member_id'))::uuid;
  v_res jsonb;
  v_ledger_before int;
  v_ledger_after int;
  v_audit_id uuid;
BEGIN
  SELECT count(*) INTO v_ledger_before
    FROM public.krug_settlement_ledger WHERE krug_id = v_krug;

  -- 3) Vlasnik ne moze izaci ovim putem.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  v_res := public.krug_leave(v_krug);
  IF v_res->>'outcome' <> 'owner_cannot_leave' THEN
    RAISE EXCEPTION 'FAIL 3: owner leave outcome = %', v_res;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id = v_krug AND user_id = v_owner) THEN
    RAISE EXCEPTION 'FAIL 3b: ownership row removed by owner_cannot_leave path';
  END IF;
  RAISE NOTICE 'PASS 3: owner_cannot_leave';

  -- 1) Clan izlazi sam, bez ijednog pristanka.
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  v_res := public.krug_leave(v_krug);
  IF v_res->>'outcome' <> 'ok_left' THEN
    RAISE EXCEPTION 'FAIL 1: member leave outcome = %', v_res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.krug_membership WHERE krug_id = v_krug AND user_id = v_member) THEN
    RAISE EXCEPTION 'FAIL 1b: membership row still present after leave';
  END IF;
  RAISE NOTICE 'PASS 1: member left on their own';

  -- 2) Idempotencija.
  v_res := public.krug_leave(v_krug);
  IF v_res->>'outcome' <> 'noop_not_member' THEN
    RAISE EXCEPTION 'FAIL 2: repeated leave outcome = %', v_res;
  END IF;
  RAISE NOTICE 'PASS 2: repeated leave is a no-op';

  -- 4) Razracunavanja netaknuta.
  SELECT count(*) INTO v_ledger_after
    FROM public.krug_settlement_ledger WHERE krug_id = v_krug;
  IF v_ledger_after <> v_ledger_before THEN
    RAISE EXCEPTION 'FAIL 4: settlement rows changed % -> %', v_ledger_before, v_ledger_after;
  END IF;
  RAISE NOTICE 'PASS 4: settlement history untouched (% rows)', v_ledger_after;

  -- 7) Audit zapis + append-only.
  SELECT id INTO v_audit_id FROM public.krug_membership_audit
   WHERE krug_id = v_krug AND user_id = v_member AND event = 'member_left';
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 7: no member_left audit row';
  END IF;
  BEGIN
    UPDATE public.krug_membership_audit SET event = 'tampered' WHERE id = v_audit_id;
    RAISE EXCEPTION 'FAIL 7b: audit row was updatable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 7: audit append-only (%)', SQLERRM;
  END;
  BEGIN
    DELETE FROM public.krug_membership_audit WHERE id = v_audit_id;
    RAISE EXCEPTION 'FAIL 7c: audit row was deletable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 7d: audit delete blocked (%)', SQLERRM;
  END;
END $$;

-- 5) + 6) RLS provjere pod rolom `authenticated` (superuser bypassa RLS).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', trim(both '''' from current_setting('test.member_id')), true);

DO $$
DECLARE
  v_krug uuid := trim(both '''' from current_setting('test.krug_id'))::uuid;
  v_owner uuid := trim(both '''' from current_setting('test.owner_id'))::uuid;
  v_cnt int;
  v_deleted int;
BEGIN
  -- READ: izasli clan ne vidi nijedan redak clanstva tog Kruga.
  SELECT count(*) INTO v_cnt FROM public.krug_membership WHERE krug_id = v_krug;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL 5: left member still reads % membership rows', v_cnt;
  END IF;
  RAISE NOTICE 'PASS 5: left member has no read access';

  -- WRITE: ne moze se vratiti (INSERT nema politiku / consent trigger).
  BEGIN
    INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
    VALUES (v_krug, auth.uid(), 'obicni', auth.uid());
    RAISE EXCEPTION 'FAIL 5b: left member re-inserted themselves';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'PASS 5b: re-insert blocked';
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS 5b: re-insert blocked (%)', SQLERRM;
  END;

  -- 6) Direktan DELETE (samoizlazak mimo RPC-a) i dalje ne prolazi.
  WITH d AS (
    DELETE FROM public.krug_membership
     WHERE krug_id = v_krug AND user_id = v_owner
     RETURNING 1
  ) SELECT count(*) INTO v_deleted FROM d;
  IF v_deleted <> 0 THEN
    RAISE EXCEPTION 'FAIL 6: direct DELETE removed % rows', v_deleted;
  END IF;
  RAISE NOTICE 'PASS 6: direct DELETE still blocked';
END $$;

RESET ROLE;

ROLLBACK;
