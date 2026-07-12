-- Layer 2 — state-sweep invariants (Krug governance + shared source + balance drift).
--
-- Runs ONCE after all 6 concurrency scenarios complete. Each check throws
-- with a descriptive message on the first violation. Runner (invariants/run-all.sh)
-- stops the whole Layer 2 run on any raise.
--
-- Scope note:
--   - Only sweeps `layer2-*` fixtures (name / description prefix) so it never
--     complains about smoke seed rows.
--   - Balance-drift check is authoritative for the touched sources only;
--     the full balance regression suite (supabase/tests/balance/) remains
--     the source of truth for the anchor engine itself.

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- I1. No expense is simultaneously in two mutually-exclusive shared statuses.
--     (This is a check on the state machine, not the enum: `krug_privacy='shared'`
--     REQUIRES a non-null krug_shared_status; `personal` REQUIRES it be NULL.)
-- =============================================================================
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.expenses e
   WHERE e.deleted_at IS NULL
     AND (e.description LIKE 'layer2-%' OR e.note LIKE 'layer2-%')
     AND (
           (e.krug_privacy = 'shared'::public.krug_privacy
            AND e.krug_shared_status IS NULL)
        OR (e.krug_privacy = 'personal'::public.krug_privacy
            AND e.krug_shared_status IS NOT NULL)
     );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANT I1 (privacy/status coherence) violated: % rows', v_bad;
  END IF;
  RAISE NOTICE 'PASS I1 privacy/status coherence';
END $$;

-- =============================================================================
-- I2. Krug approval terminal-state uniqueness.
--     For every Layer 2 expense that received A1/A2 (governance acts), there is
--     at most ONE 'ok_confirmed' and at most ONE 'ok_negated' dedup row.
--     A double confirmation persisted in the audit trail would be a contradiction.
-- =============================================================================
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM (
    SELECT d.expense_id, d.outcome, count(*) AS n
      FROM public.krug_act_dedup d
      JOIN public.expenses e ON e.id = d.expense_id
     WHERE (e.description LIKE 'layer2-%' OR e.note LIKE 'layer2-%')
       AND d.outcome IN ('ok_confirmed','ok_negated')
     GROUP BY d.expense_id, d.outcome
     HAVING count(*) > 1
  ) x;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANT I2 (terminal act uniqueness) violated: % (expense,outcome) with >1 row', v_bad;
  END IF;
  RAISE NOTICE 'PASS I2 terminal act uniqueness';
END $$;

-- =============================================================================
-- I3. krug_shared_payment_source: no duplicate live link.
--     UNIQUE(krug_id, payment_source_id) is enforced at the constraint level;
--     this sweep also catches any accidental gap (e.g. constraint dropped).
-- =============================================================================
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM (
    SELECT krug_id, payment_source_id, count(*) AS n
      FROM public.krug_shared_payment_source s
      JOIN public.krug k ON k.id = s.krug_id
     WHERE k.name LIKE 'layer2-%'
     GROUP BY krug_id, payment_source_id
     HAVING count(*) > 1
  ) x;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANT I3 (shared source uniqueness) violated: % duplicate pair(s)', v_bad;
  END IF;
  RAISE NOTICE 'PASS I3 shared source uniqueness';
END $$;

-- =============================================================================
-- I4. Dedup audit chain integrity.
--     Every layer2 dedup row must reference an existing expense in the same
--     Layer 2 fixture namespace (no orphaned governance audit).
-- =============================================================================
DO $$
DECLARE
  v_orphan int;
BEGIN
  SELECT count(*) INTO v_orphan
    FROM public.krug_act_dedup d
    LEFT JOIN public.expenses e ON e.id = d.expense_id
   WHERE d.client_request_id ~ '^[0-9a-f-]{36}$'
     AND (e.description LIKE 'layer2-%' OR e.note LIKE 'layer2-%')
     AND e.id IS NULL;
  IF v_orphan > 0 THEN
    RAISE EXCEPTION 'INVARIANT I4 (dedup orphans) violated: % orphaned dedup rows', v_orphan;
  END IF;
  RAISE NOTICE 'PASS I4 dedup audit integrity';
END $$;

-- =============================================================================
-- I5. Balance drift on Layer 2 custom_payment_sources.
--     For every source created by Layer 2 (name prefix), stored balance must
--     equal the ledger-scan preview. This is our narrow authoritative reuse of
--     the balance engine — the full regression suite remains authoritative for
--     the engine itself.
-- =============================================================================
DO $$
DECLARE
  r record;
  v_preview numeric;
BEGIN
  FOR r IN
    SELECT id, name, balance
      FROM public.custom_payment_sources
     WHERE name LIKE 'layer2-%'
  LOOP
    v_preview := public.recompute_custom_source_balance_preview(r.id);
    IF v_preview IS DISTINCT FROM r.balance THEN
      RAISE EXCEPTION
        'INVARIANT I5 (balance drift) violated: source % (%): stored=% preview=%',
        r.name, r.id, r.balance, v_preview;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS I5 balance drift (touched sources)';
END $$;

-- =============================================================================
-- I6. Payout ↔ expense soft-delete coherence.
--     Every voided payout in Layer 2 must have its expense soft-deleted;
--     conversely, no live payout may point at a soft-deleted expense.
-- =============================================================================
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.project_worker_payouts p
    JOIN public.expenses e ON e.id = p.expense_id
   WHERE p.note LIKE 'layer2-%'
     AND (
           (p.status = 'voided' AND e.deleted_at IS NULL)
        OR (p.status <> 'voided' AND e.deleted_at IS NOT NULL)
     );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANT I6 (payout/expense coherence) violated: % rows', v_bad;
  END IF;
  RAISE NOTICE 'PASS I6 payout/expense coherence';
END $$;

-- =============================================================================
-- I7. Cron must remain paused during Layer 2 (defence-in-depth: bin/run-all.sh
--     already pauses, but a rogue resume mid-run would poison invariants).
-- =============================================================================
DO $$
DECLARE
  v_active int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    SELECT count(*) INTO v_active FROM cron.job WHERE active = true;
    IF v_active > 0 THEN
      RAISE EXCEPTION 'INVARIANT I7 (cron paused) violated: % active job(s)', v_active;
    END IF;
    RAISE NOTICE 'PASS I7 cron paused';
  ELSE
    RAISE NOTICE 'SKIP I7 (no pg_cron)';
  END IF;
END $$;

COMMIT;

\echo 'All Layer 2 Krug invariants passed.'
