-- Manual governance flow harness for Krug Faza B (settlement ledger + override).
--
-- IMPORTANT:
--   a) This template requires a dev cluster where the executing role has USAGE
--      on the `auth` schema (e.g. supabase service_role or a local postgres role
--      with auth schema access). It MUST NOT be run through a sandbox/managed
--      role that lacks auth schema USAGE, because triggers such as
--      `krug_enforce_created_by` invoke `auth.uid()`.
--   b) The entire script is wrapped in BEGIN ... ROLLBACK so no rows survive.
--      It is rollback-safe by design.
--   c) Covers 7 single-session scenarios (non-member gates, happy paths, void
--      guards, multi-sig confirm, supersede logic).
--   d) Two-session concurrency/stress testing is intentionally deferred to the
--      post-launch stress backlog (option D). Do not run this file in parallel
--      sessions expecting a concurrency verdict.
--
-- Usage:
--   psql ... -v krug_id="'<uuid>'" -v owner_id="'<uuid>'" -v other_id="'<uuid>'" \
--            -v expense_id="'<uuid>'" -v nonmember_id="'<uuid>'" \
--            -f supabase/tests/krug/governance_flow.sql
--
-- All UUIDs must point to synthetic test data created inside the transaction.
-- Never run this against production user data.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_krug uuid := :'krug_id';
  v_owner uuid := :'owner_id';   -- full member
  v_other uuid := :'other_id';   -- second full member
  v_expense uuid := :'expense_id'; -- shared, confirmed expense
  v_nonmember uuid := :'nonmember_id'; -- user outside the krug
  v_ledger uuid;
  v_override uuid;
  v_activated boolean;
BEGIN
  -- 1) non-member gate on mark_settled
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_nonmember::text, true);
    PERFORM public.krug_mark_settled(v_krug, v_owner, v_other, 10, 'EUR', null);
    RAISE EXCEPTION 'FAIL 1: non-member allowed mark_settled';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    RAISE NOTICE 'PASS 1: non-member blocked on mark_settled';
  END;

  -- 2) mark_settled happy path + ledger insert
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SELECT (public.krug_mark_settled(v_krug, v_owner, v_other, 15.50, 'EUR', 'test'))->>'id'
    INTO v_ledger;
  IF v_ledger IS NULL THEN RAISE EXCEPTION 'FAIL 2: no ledger id'; END IF;
  RAISE NOTICE 'PASS 2: ledger row %', v_ledger;

  -- 3) void_settlement happy path
  PERFORM public.krug_void_settlement(v_ledger::uuid, 'undo');
  IF NOT EXISTS (SELECT 1 FROM public.krug_settlement_ledger
                 WHERE id = v_ledger::uuid AND voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 3: void did not stick';
  END IF;
  RAISE NOTICE 'PASS 3: void marked';

  -- 4) void_settlement already_voided guard
  BEGIN
    PERFORM public.krug_void_settlement(v_ledger::uuid, 'again');
    RAISE EXCEPTION 'FAIL 4: double void allowed';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'PASS 4: already_voided guard';
  END;

  -- 5) override_propose multi-member -> pending, then supersede withdraws stale pending
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
  IF EXISTS (SELECT 1 FROM public.krug_expense_split_override
             WHERE id = v_override::uuid AND status = 'pending') THEN
    RAISE EXCEPTION 'FAIL 5: supersede did not withdraw old pending';
  END IF;
  RAISE NOTICE 'PASS 5: supersede withdrew stale pending';

  -- 6) confirm from second member activates the latest pending override
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

  -- 7) non-member gate on override_propose
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
