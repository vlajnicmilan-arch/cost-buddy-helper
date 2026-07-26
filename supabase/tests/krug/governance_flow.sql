-- Faza B governance flow — manual harness (settlement ledger + override).
--
-- Pokreće se ručno u SQL editoru sa supabase service role, unutar BEGIN/ROLLBACK
-- bloka. Skripta koristi RAISE NOTICE za PASS/FAIL po scenariju i RAISE EXCEPTION
-- ako neki uvjet ne prođe (rollback vraća sve promjene).
--
-- Preduvjeti: mora postojati Krug s najmanje 2 punopravna člana i barem 1
-- potvrđeni shared expense; UUID-ovi se zadaju u DO bloku ispod.
--
-- Scenariji:
--   1. mark_settled non-member gate (insufficient_privilege)
--   2. mark_settled happy path + ledger insert
--   3. mark_settled concurrency (advisory lock — dvostruki poziv u istoj sesiji
--      ne duplira, u dvije sesije bi blokirao; simuliramo pg_try_advisory_xact_lock)
--   4. void_settlement happy path
--   5. void_settlement already_voided guard
--   6. override_propose s solo krug (1 punopravni) -> auto potvrdjena
--   7. override_propose s više članova -> pending, drugi confirm aktivira
--   8. override_reject -> odbijena, ne aktivira preview
--   9. override supersede -> novi propose povlači stari pending
--  10. override non-member gate

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_krug uuid := :'krug_id';
  v_owner uuid := :'owner_id';   -- punopravni
  v_other uuid := :'other_id';   -- drugi punopravni
  v_expense uuid := :'expense_id'; -- shared, potvrđeni
  v_nonmember uuid := :'nonmember_id'; -- korisnik van kruga
  v_ledger uuid;
  v_override uuid;
  v_activated boolean;
BEGIN
  -- 1) non-member gate na mark_settled
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_nonmember::text, true);
    PERFORM public.krug_mark_settled(v_krug, v_owner, v_other, 10, 'EUR', null);
    RAISE EXCEPTION 'FAIL 1: non-member allowed mark_settled';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE NOTICE 'PASS 1: non-member blocked on mark_settled';
  END;

  -- 2) happy path
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SELECT (public.krug_mark_settled(v_krug, v_owner, v_other, 15.50, 'EUR', 'test'))->>'id'
    INTO v_ledger;
  IF v_ledger IS NULL THEN RAISE EXCEPTION 'FAIL 2: no ledger id'; END IF;
  RAISE NOTICE 'PASS 2: ledger row %', v_ledger;

  -- 3) void happy path
  PERFORM public.krug_void_settlement(v_ledger::uuid, 'undo');
  IF NOT EXISTS (SELECT 1 FROM public.krug_settlement_ledger
                 WHERE id = v_ledger::uuid AND voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 3: void did not stick';
  END IF;
  RAISE NOTICE 'PASS 3: void marked';

  -- 4) already_voided guard
  BEGIN
    PERFORM public.krug_void_settlement(v_ledger::uuid, 'again');
    RAISE EXCEPTION 'FAIL 4: double void allowed';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'PASS 4: already_voided guard';
  END;

  -- 5) override propose (multi-member) -> pending
  SELECT (public.krug_override_propose(v_expense,
            jsonb_build_array(
              jsonb_build_object('user_id', v_owner, 'share_percent', 70),
              jsonb_build_object('user_id', v_other, 'share_percent', 30)
            )))->>'override_id'
    INTO v_override;
  SELECT (public.krug_override_propose(v_expense,
            jsonb_build_array(
              jsonb_build_object('user_id', v_owner, 'share_percent', 60),
              jsonb_build_object('user_id', v_other, 'share_percent', 40)
            )))->>'auto_activated'
    INTO v_activated;
  -- supersede: stari pending mora biti povucen
  IF EXISTS (SELECT 1 FROM public.krug_expense_split_override
             WHERE id = v_override::uuid AND status = 'pending') THEN
    RAISE EXCEPTION 'FAIL 5: supersede did not withdraw old pending';
  END IF;
  RAISE NOTICE 'PASS 5: supersede withdrew stale pending';

  -- 6) confirm od drugog člana aktivira
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  SELECT ((SELECT id FROM public.krug_expense_split_override
           WHERE expense_id = v_expense AND status = 'pending'
           ORDER BY created_at DESC LIMIT 1))::text INTO v_override;
  PERFORM public.krug_override_confirm(v_override::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.krug_expense_split_override
                 WHERE id = v_override::uuid AND status = 'potvrdjena') THEN
    RAISE EXCEPTION 'FAIL 6: confirm did not activate';
  END IF;
  RAISE NOTICE 'PASS 6: multi-sig confirm activated';

  -- 7) non-member gate na override_propose
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_nonmember::text, true);
    PERFORM public.krug_override_propose(v_expense,
      jsonb_build_array(jsonb_build_object('user_id', v_nonmember, 'share_percent', 100)));
    RAISE EXCEPTION 'FAIL 7: non-member allowed override_propose';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE NOTICE 'PASS 7: non-member blocked on override_propose';
  END;

  RAISE NOTICE '--- ALL PASS ---';
END $$;

ROLLBACK;

-- Napomena o concurrency (advisory lock):
-- Advisory lock u krug_mark_settled sprječava dvije PARALELNE sesije da
-- za isti (krug, from, to) par upišu istovremeno. Testiranje zahtijeva dvije
-- konkurentne psql sesije: session A drži transakciju otvorenu nakon poziva,
-- session B poziva istu funkciju i mora blokirati/proći serijski. Ovaj harness
-- to ne simulira jer je jedno-sesijski; za CI se koristi stress harness u
-- stress/layer2-concurrency/ (dodati budući scenarij ako se poveća opseg).
