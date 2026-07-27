-- Manual settlement invariants harness for Krug Faza C4.
--
-- IMPORTANT:
--   a) Requires a dev cluster where the executing role has USAGE on the `auth`
--      schema (auth.uid() is invoked by SECURITY DEFINER RPCs used below, e.g.
--      krug_settlement_preview). Do NOT run through a sandbox / managed role
--      that lacks auth schema USAGE.
--   b) The entire script is wrapped in BEGIN ... ROLLBACK — rollback-safe by
--      design. Preflight and postflight COUNT(*) probes assert nothing was
--      written (touches_balance=false, no ledger/override/share/snapshot rows
--      created or mutated).
--   c) Covers 5 read-only invariants of the settlement engine:
--        I1 balance sum (paid ≡ owed per period, FX rounding tolerance)
--        I2 settled ≤ owed (per from→to pair)
--        I3 FX snapshot immutability (repeat preview equal, fx.frozen=true)
--        I4 override multi-sig integrity (confirmations = full members - proposer)
--        I5 ledger non-negativity (net settled - voided >= 0)
--      It does NOT mutate balance, does NOT write to ledger, does NOT call
--      mark_settled / override_confirm / void_settlement.
--   d) Do NOT run against production. Use a dev cluster with a pre-existing
--      Krug that has ≥2 punopravni members, ≥1 shared confirmed expense in
--      the target period, and (optionally) a frozen FX snapshot to exercise I3.
--
-- Usage:
--   psql ... \
--     -v krug_id="'<uuid>'" \
--     -v owner_id="'<uuid>'" \
--     -v other_id="'<uuid>'" \
--     -v third_id="'<uuid>'" \
--     -v period_start="'YYYY-MM-DD'" \
--     -v period_end="'YYYY-MM-DD'" \
--     -f supabase/tests/krug/settlement_invariants.sql
--
-- All UUIDs must reference synthetic / dev test data. Never run against
-- production user data.

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Preflight: snapshot row counts on tables this harness must NEVER mutate.
-- Postflight below re-checks and raises if any diverged.
-- =============================================================================
CREATE TEMP TABLE _c4_preflight ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.krug_settlement_ledger)         AS ledger_n,
  (SELECT count(*) FROM public.krug_expense_split_override)    AS override_n,
  (SELECT count(*) FROM public.krug_expense_split_share)       AS share_n,
  (SELECT count(*) FROM public.krug_settlement_fx_snapshot)    AS fx_snap_n,
  (SELECT count(*) FROM public.krug_expense_split_confirmation) AS confirm_n,
  (SELECT count(*) FROM pg_locks WHERE NOT granted)             AS blocked_locks;

DO $$
DECLARE
  v_krug         uuid := :'krug_id';
  v_owner        uuid := :'owner_id';
  v_other        uuid := :'other_id';
  v_third        uuid := :'third_id';
  v_period_start date := :'period_start';
  v_period_end   date := :'period_end';
  v_preview      jsonb;
  v_preview2     jsonb;
  v_paid         numeric;
  v_owed         numeric;
  v_members_n    int;
  v_bad          int;
BEGIN
  -- Establish auth context so SECURITY DEFINER RPCs see a real member.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  ---------------------------------------------------------------------------
  -- I1. Balance sum: sum(paid) ≡ sum(owed) per period (FX rounding tolerance
  --     of ±0.02 * member_count).
  ---------------------------------------------------------------------------
  v_preview := public.krug_settlement_preview(
    v_krug, v_period_start, v_period_end, 'EUR', '{}'::jsonb
  );
  SELECT COALESCE(sum((m->>'paid')::numeric), 0),
         COALESCE(sum((m->>'owed')::numeric), 0),
         COALESCE(jsonb_array_length(v_preview->'members'), 0)
    INTO v_paid, v_owed, v_members_n
    FROM jsonb_array_elements(v_preview->'members') m;

  IF abs(v_paid - v_owed) > 0.02 * GREATEST(v_members_n, 1) THEN
    RAISE EXCEPTION 'FAIL I1 (balance sum) paid=% owed=% members=% delta=%',
      v_paid, v_owed, v_members_n, abs(v_paid - v_owed);
  END IF;
  RAISE NOTICE 'PASS I1 balance sum (paid=%, owed=%, members=%)',
    v_paid, v_owed, v_members_n;

  ---------------------------------------------------------------------------
  -- I2. Settled ≤ owed per (from,to,currency).
  --     For each transfer in preview, live ledger sum (voided_at IS NULL)
  --     must be ≤ transfer.amount + 0.01. For pairs with NO preview transfer,
  --     ledger for that pair (in this period) must sum to 0.
  ---------------------------------------------------------------------------
  WITH transfers AS (
    SELECT (t->>'from')::uuid       AS from_user,
           (t->>'to')::uuid         AS to_user,
           COALESCE(t->>'currency','EUR') AS currency,
           (t->>'amount')::numeric  AS amount
      FROM jsonb_array_elements(COALESCE(v_preview->'transfers', '[]'::jsonb)) t
  ),
  ledger AS (
    SELECT from_user_id, to_user_id, currency,
           COALESCE(sum(amount) FILTER (WHERE voided_at IS NULL), 0) AS settled
      FROM public.krug_settlement_ledger
     WHERE krug_id = v_krug
       AND period_start = v_period_start
       AND period_end   = v_period_end
     GROUP BY from_user_id, to_user_id, currency
  )
  SELECT count(*) INTO v_bad
    FROM ledger l
    LEFT JOIN transfers t
      ON t.from_user = l.from_user_id
     AND t.to_user   = l.to_user_id
     AND t.currency  = l.currency
   WHERE (t.amount IS NULL AND l.settled <> 0)
      OR (t.amount IS NOT NULL AND l.settled > t.amount + 0.01);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL I2 (settled>owed) violating pairs: %', v_bad;
  END IF;
  RAISE NOTICE 'PASS I2 settled ≤ owed';

  ---------------------------------------------------------------------------
  -- I3. FX snapshot immutability: repeat preview equal (transfers, round 6).
  --     If a snapshot exists for (krug, period, display_currency), preview
  --     must set fx.frozen=true and yield deterministic transfers.
  ---------------------------------------------------------------------------
  v_preview2 := public.krug_settlement_preview(
    v_krug, v_period_start, v_period_end, 'EUR', '{}'::jsonb
  );
  IF EXISTS (
    SELECT 1 FROM public.krug_settlement_fx_snapshot
     WHERE krug_id = v_krug
       AND period_start = v_period_start
       AND period_end   = v_period_end
       AND display_currency = 'EUR'
  ) THEN
    IF COALESCE((v_preview->'fx'->>'frozen')::boolean, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FAIL I3 (fx.frozen) snapshot present but fx.frozen<>true';
    END IF;
  END IF;

  WITH a AS (
    SELECT jsonb_agg(jsonb_build_object(
             'from', t->>'from', 'to', t->>'to',
             'currency', COALESCE(t->>'currency','EUR'),
             'amount', round((t->>'amount')::numeric, 6))
             ORDER BY t->>'from', t->>'to', COALESCE(t->>'currency','EUR')) AS j
      FROM jsonb_array_elements(COALESCE(v_preview ->'transfers','[]'::jsonb)) t
  ),
  b AS (
    SELECT jsonb_agg(jsonb_build_object(
             'from', t->>'from', 'to', t->>'to',
             'currency', COALESCE(t->>'currency','EUR'),
             'amount', round((t->>'amount')::numeric, 6))
             ORDER BY t->>'from', t->>'to', COALESCE(t->>'currency','EUR')) AS j
      FROM jsonb_array_elements(COALESCE(v_preview2->'transfers','[]'::jsonb)) t
  )
  SELECT count(*) INTO v_bad FROM a, b WHERE COALESCE(a.j,'[]'::jsonb) IS DISTINCT FROM COALESCE(b.j,'[]'::jsonb);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL I3 (fx immutability) repeat preview diverged';
  END IF;
  RAISE NOTICE 'PASS I3 FX snapshot immutability';

  ---------------------------------------------------------------------------
  -- I4. Override multi-sig integrity.
  --     For every 'potvrdjena' override, confirmations count must equal
  --     (# punopravni members of the krug) - 1 (the proposer auto-counts).
  --     krug_membership_role enum values in this DB: 'punopravni', 'obicni'.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_bad FROM (
    SELECT o.id,
           (SELECT count(*) FROM public.krug_membership m
             WHERE m.krug_id = v_krug
               AND m.role = 'punopravni'::public.krug_membership_role
               AND m.user_id <> o.proposed_by) AS required_confirms,
           (SELECT count(*) FROM public.krug_expense_split_confirmation c
             WHERE c.override_id = o.id) AS actual_confirms
      FROM public.krug_expense_split_override o
      JOIN public.expenses e ON e.id = o.expense_id
     WHERE o.status = 'potvrdjena'::public.krug_override_status
       AND e.date BETWEEN v_period_start AND v_period_end
       AND EXISTS (
         SELECT 1 FROM public.krug_membership mm
          WHERE mm.krug_id = v_krug AND mm.user_id = o.proposed_by
       )
  ) x
  WHERE x.required_confirms <> x.actual_confirms;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL I4 (override multi-sig) overrides with mismatched confirmations: %', v_bad;
  END IF;
  RAISE NOTICE 'PASS I4 override multi-sig integrity';

  ---------------------------------------------------------------------------
  -- I5. Ledger non-negativity: sum(amount) FILTER (voided_at IS NULL) >= 0
  --     per (krug, from, to, currency). A negative net means more was voided
  --     than ever recorded live — a broken state.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_bad FROM (
    SELECT krug_id, from_user_id, to_user_id, currency,
           COALESCE(sum(amount) FILTER (WHERE voided_at IS NULL), 0) AS net
      FROM public.krug_settlement_ledger
     WHERE krug_id = v_krug
     GROUP BY krug_id, from_user_id, to_user_id, currency
     HAVING COALESCE(sum(amount) FILTER (WHERE voided_at IS NULL), 0) < 0
  ) x;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL I5 (ledger non-negativity) negative-net pairs: %', v_bad;
  END IF;
  RAISE NOTICE 'PASS I5 ledger non-negativity';

  RAISE NOTICE '--- ALL SETTLEMENT INVARIANTS PASS ---';
END $$;

-- =============================================================================
-- Postflight: assert this harness wrote nothing and holds no blocked locks.
-- =============================================================================
DO $$
DECLARE
  pf record;
  cur record;
BEGIN
  SELECT * INTO pf FROM _c4_preflight;
  SELECT
    (SELECT count(*) FROM public.krug_settlement_ledger)          AS ledger_n,
    (SELECT count(*) FROM public.krug_expense_split_override)     AS override_n,
    (SELECT count(*) FROM public.krug_expense_split_share)        AS share_n,
    (SELECT count(*) FROM public.krug_settlement_fx_snapshot)     AS fx_snap_n,
    (SELECT count(*) FROM public.krug_expense_split_confirmation) AS confirm_n,
    (SELECT count(*) FROM pg_locks WHERE NOT granted)              AS blocked_locks
  INTO cur;

  IF (pf.ledger_n, pf.override_n, pf.share_n, pf.fx_snap_n, pf.confirm_n)
     IS DISTINCT FROM
     (cur.ledger_n, cur.override_n, cur.share_n, cur.fx_snap_n, cur.confirm_n) THEN
    RAISE EXCEPTION 'FAIL postflight: row counts changed (ledger %→%, override %→%, share %→%, fx_snap %→%, confirm %→%)',
      pf.ledger_n, cur.ledger_n,
      pf.override_n, cur.override_n,
      pf.share_n, cur.share_n,
      pf.fx_snap_n, cur.fx_snap_n,
      pf.confirm_n, cur.confirm_n;
  END IF;

  IF cur.blocked_locks > pf.blocked_locks THEN
    RAISE EXCEPTION 'FAIL postflight: blocked locks grew (%→%)',
      pf.blocked_locks, cur.blocked_locks;
  END IF;

  RAISE NOTICE 'PASS postflight: no writes, no new blocked locks';
END $$;

ROLLBACK;

\echo 'All Krug settlement invariants passed (rolled back — template only).'
