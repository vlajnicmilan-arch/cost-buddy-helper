-- Krug owner leave guard — prijenos vlasnistva + izlazak vlasnika.
--
-- Dokazuje:
--   1) vlasnik izlazi SAMO uz nasljednika: `ok_transferred`, vlasnistvo je
--      na nasljedniku, staro clanstvo vlasnika je obrisano
--   2) ponovljeni poziv je idempotentan (`noop_not_owner`)
--   3) ne-vlasnik dobiva `not_owner`
--   4) nasljednik mora biti punopravni clan (`successor_not_full_member`)
--      i ne smije biti pozivatelj (`successor_invalid`)
--   5) bez punopravnih clanova izlazak se odbija (`no_successor_available`) —
--      arhiviranje je zasebna isporuka, nema polovicnog stanja
--   6) RLS: bivsi vlasnik (ujedno `created_by`) vise NE vidi krug redak
--   7) audit: `ownership_transferred` + `owner_left`
--   8) razracunavanja ostaju netaknuta
--
-- Rollback-safe (BEGIN ... ROLLBACK).
--
-- Usage:
--   psql ... -v krug_id="'<uuid>'" -v owner_id="'<uuid>'" \
--            -v member_id="'<uuid>'" -v other_id="'<uuid>'" \
--            -f supabase/tests/krug/owner_leave.sql

\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('test.krug_id', :'krug_id', false),
       set_config('test.owner_id', :'owner_id', false),
       set_config('test.member_id', :'member_id', false),
       set_config('test.other_id', :'other_id', false);

-- Fixture: vlasnik je ujedno created_by (dokazuje zatvaranje created_by rupice).
UPDATE public.krug
   SET created_by = trim(both '''' from current_setting('test.owner_id'))::uuid
 WHERE id = trim(both '''' from current_setting('test.krug_id'))::uuid;

-- Fixture clanstva (consent trigger je namjerno iskljucen — fixture, ne test).
ALTER TABLE public.krug_membership DISABLE TRIGGER USER;
INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
SELECT trim(both '''' from current_setting('test.krug_id'))::uuid,
       trim(both '''' from current_setting('test.member_id'))::uuid,
       'punopravni',
       trim(both '''' from current_setting('test.owner_id'))::uuid
ON CONFLICT DO NOTHING;
INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
SELECT trim(both '''' from current_setting('test.krug_id'))::uuid,
       trim(both '''' from current_setting('test.other_id'))::uuid,
       'obicni',
       trim(both '''' from current_setting('test.owner_id'))::uuid
ON CONFLICT DO NOTHING;
ALTER TABLE public.krug_membership ENABLE TRIGGER USER;

INSERT INTO public.krug_settlement_ledger (krug_id, from_user, to_user, amount)
VALUES (
  trim(both '''' from current_setting('test.krug_id'))::uuid,
  trim(both '''' from current_setting('test.member_id'))::uuid,
  trim(both '''' from current_setting('test.owner_id'))::uuid,
  13.37
);

DO $$
DECLARE
  v_krug uuid := trim(both '''' from current_setting('test.krug_id'))::uuid;
  v_owner uuid := trim(both '''' from current_setting('test.owner_id'))::uuid;
  v_member uuid := trim(both '''' from current_setting('test.member_id'))::uuid;
  v_other uuid := trim(both '''' from current_setting('test.other_id'))::uuid;
  v_res jsonb;
  v_ledger_before int;
  v_ledger_after int;
BEGIN
  SELECT count(*) INTO v_ledger_before
    FROM public.krug_settlement_ledger WHERE krug_id = v_krug;

  -- 3) Ne-vlasnik.
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  v_res := public.krug_owner_leave(v_krug, v_other);
  IF v_res->>'outcome' <> 'not_owner' THEN
    RAISE EXCEPTION 'FAIL 3: non-owner outcome = %', v_res;
  END IF;
  RAISE NOTICE 'PASS 3: not_owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  -- 4a) Nasljednik = pozivatelj.
  v_res := public.krug_owner_leave(v_krug, v_owner);
  IF v_res->>'outcome' <> 'successor_invalid' THEN
    RAISE EXCEPTION 'FAIL 4a: self successor outcome = %', v_res;
  END IF;
  RAISE NOTICE 'PASS 4a: successor_invalid';

  -- 4b) Nasljednik nije punopravni.
  v_res := public.krug_owner_leave(v_krug, v_other);
  IF v_res->>'outcome' <> 'successor_not_full_member' THEN
    RAISE EXCEPTION 'FAIL 4b: obicni successor outcome = %', v_res;
  END IF;
  RAISE NOTICE 'PASS 4b: successor_not_full_member';

  -- 4c) Nasljednik nije clan.
  v_res := public.krug_owner_leave(v_krug, gen_random_uuid());
  IF v_res->>'outcome' <> 'successor_gone' THEN
    RAISE EXCEPTION 'FAIL 4c: stranger successor outcome = %', v_res;
  END IF;
  RAISE NOTICE 'PASS 4c: successor_gone';

  -- 1) Happy path.
  v_res := public.krug_owner_leave(v_krug, v_member);
  IF v_res->>'outcome' <> 'ok_transferred' THEN
    RAISE EXCEPTION 'FAIL 1: transfer outcome = %', v_res;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.krug_ownership WHERE krug_id = v_krug AND user_id = v_member
  ) THEN
    RAISE EXCEPTION 'FAIL 1b: ownership not moved to successor';
  END IF;
  IF (SELECT count(*) FROM public.krug_ownership WHERE krug_id = v_krug) <> 1 THEN
    RAISE EXCEPTION 'FAIL 1c: ownership row count <> 1';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.krug_membership WHERE krug_id = v_krug AND user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'FAIL 1d: old owner membership still present';
  END IF;
  RAISE NOTICE 'PASS 1: ownership transferred and owner left';

  -- 2) Idempotencija.
  v_res := public.krug_owner_leave(v_krug, v_member);
  IF v_res->>'outcome' <> 'noop_not_owner' THEN
    RAISE EXCEPTION 'FAIL 2: repeated call outcome = %', v_res;
  END IF;
  RAISE NOTICE 'PASS 2: noop_not_owner';

  -- 7) Audit.
  IF NOT EXISTS (
    SELECT 1 FROM public.krug_membership_audit
     WHERE krug_id = v_krug AND event = 'ownership_transferred' AND user_id = v_member
  ) THEN
    RAISE EXCEPTION 'FAIL 7a: no ownership_transferred audit row';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.krug_membership_audit
     WHERE krug_id = v_krug AND event = 'owner_left' AND user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'FAIL 7b: no owner_left audit row';
  END IF;
  RAISE NOTICE 'PASS 7: audit trail complete';

  -- 8) Razracunavanja netaknuta.
  SELECT count(*) INTO v_ledger_after
    FROM public.krug_settlement_ledger WHERE krug_id = v_krug;
  IF v_ledger_after <> v_ledger_before THEN
    RAISE EXCEPTION 'FAIL 8: settlement rows changed % -> %', v_ledger_before, v_ledger_after;
  END IF;
  RAISE NOTICE 'PASS 8: settlement history untouched';

  -- 5) Novi vlasnik je sada jedini punopravni: izlazak bez nasljednika pada.
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  v_res := public.krug_owner_leave(v_krug, v_other);
  IF v_res->>'outcome' <> 'no_successor_available' THEN
    RAISE EXCEPTION 'FAIL 5: expected no_successor_available, got %', v_res;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.krug_ownership WHERE krug_id = v_krug AND user_id = v_member
  ) THEN
    RAISE EXCEPTION 'FAIL 5b: ownership lost on refused leave';
  END IF;
  RAISE NOTICE 'PASS 5: no_successor_available, state untouched';
END $$;

-- 6) RLS: bivsi vlasnik (created_by!) vise ne vidi krug redak.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', trim(both '''' from current_setting('test.owner_id')), true);

DO $$
DECLARE
  v_krug uuid := trim(both '''' from current_setting('test.krug_id'))::uuid;
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.krug WHERE id = v_krug;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL 6: ex-owner/creator still reads krug row (created_by loophole)';
  END IF;
  RAISE NOTICE 'PASS 6: created_by loophole closed';

  SELECT count(*) INTO v_cnt FROM public.krug_membership WHERE krug_id = v_krug;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL 6b: ex-owner still reads % membership rows', v_cnt;
  END IF;
  RAISE NOTICE 'PASS 6b: ex-owner has no membership read access';
END $$;

RESET ROLE;

ROLLBACK;
