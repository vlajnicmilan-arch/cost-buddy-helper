-- Layer 1 — load-storm invariant sweep. Runs AFTER k6 mixed_load.js completes.
--
-- Scope: only sources whose name starts 'layer1-src-' and only expenses whose
-- description starts 'layer1-'. Never touches layer2 fixtures or smoke seed.
--
-- Gates:
--   L1-A. Balance-drift, ANCHORED sources: stored `balance` MUST equal
--         recompute_custom_source_balance_preview(id, mode). This is the
--         crown-jewel gate for the 20260713 FOR UPDATE fix under load.
--   L1-B. Balance-drift, UNANCHORED sources: stored `balance` MUST equal
--         the direct SUM (mirrors CASE split in recompute engine).
--   L1-C. Row-count parity: COUNT(expenses WHERE description LIKE 'layer1-%')
--         MUST equal :layer1_insert_ok passed in from k6 summary. Catches
--         silent row loss (e.g. RLS-rejected writes returning 201 anyway).

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_mode text;
BEGIN
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'anchor_engine_mode'), 'day_cut')
    INTO v_mode;
  RAISE NOTICE 'layer1 sweep: anchor_engine_mode = %', v_mode;
END $$;

-- =============================================================================
-- L1-A. Anchored sources: stored balance == preview(id, mode)
-- =============================================================================
DO $$
DECLARE
  v_mode text;
  v_bad int := 0;
  r record;
BEGIN
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'anchor_engine_mode'), 'day_cut')
    INTO v_mode;

  FOR r IN
    SELECT id, name, balance,
           public.recompute_custom_source_balance_preview(id, v_mode) AS preview
      FROM public.custom_payment_sources
     WHERE name LIKE 'layer1-src-%'
       AND correction_anchor_date IS NOT NULL
  LOOP
    IF r.balance IS DISTINCT FROM r.preview THEN
      RAISE WARNING 'L1-A drift: source % (%) stored=% preview=%', r.id, r.name, r.balance, r.preview;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANT L1-A (anchored balance drift) violated: % source(s)', v_bad;
  END IF;
  RAISE NOTICE 'PASS L1-A anchored balance drift (mode=%)', v_mode;
END $$;

-- =============================================================================
-- L1-B. Unanchored sources: stored balance == direct SUM (mirror of engine CASE)
-- =============================================================================
DO $$
DECLARE
  v_bad int := 0;
  r record;
  v_sum numeric(12,2);
BEGIN
  FOR r IN
    SELECT id, name, balance
      FROM public.custom_payment_sources
     WHERE name LIKE 'layer1-src-%'
       AND correction_anchor_date IS NULL
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type = 'income'   AND public._extract_custom_source_id(e.payment_source) = r.id THEN e.amount
        WHEN e.type = 'expense'  AND public._extract_custom_source_id(e.payment_source) = r.id THEN -e.amount
        WHEN e.type = 'transfer' AND public._extract_custom_source_id(e.payment_source) = r.id THEN -e.amount
        WHEN e.type = 'transfer' AND e.income_source_id = r.id THEN e.amount
        ELSE 0
      END
    ), 0)
      INTO v_sum
      FROM public.expenses e
     WHERE e.deleted_at IS NULL
       AND COALESCE(e.expense_nature, 'regular') <> 'correction'
       AND (
         public._extract_custom_source_id(e.payment_source) = r.id
         OR e.income_source_id = r.id
       );

    IF r.balance IS DISTINCT FROM v_sum THEN
      RAISE WARNING 'L1-B drift: source % (%) stored=% direct_sum=%', r.id, r.name, r.balance, v_sum;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVARIANT L1-B (unanchored balance drift) violated: % source(s)', v_bad;
  END IF;
  RAISE NOTICE 'PASS L1-B unanchored balance drift';
END $$;

-- =============================================================================
-- L1-C. Row-count parity: expenses(layer1-%) == k6 insert_ok counter.
--       :layer1_insert_ok is passed via `psql -v layer1_insert_ok=<n>`.
-- =============================================================================
DO $$
DECLARE
  v_stored int;
  v_reported int := :layer1_insert_ok;
BEGIN
  SELECT count(*) INTO v_stored
    FROM public.expenses
   WHERE deleted_at IS NULL
     AND description LIKE 'layer1-%';

  IF v_stored <> v_reported THEN
    RAISE EXCEPTION 'INVARIANT L1-C (row-count parity) violated: expenses(layer1-%%)=% but k6 insert_ok=%',
      v_stored, v_reported;
  END IF;
  RAISE NOTICE 'PASS L1-C row-count parity (rows=% == insert_ok=%)', v_stored, v_reported;
END $$;

COMMIT;
