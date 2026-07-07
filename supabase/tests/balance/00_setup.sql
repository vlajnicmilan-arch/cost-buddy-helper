-- Balance regression SQL harness — setup
-- Requires: migrations 20260624083605, 20260624132036, 20260628205415 applied.
--
-- All scenarios run inside a single transaction and ROLLBACK at the end so
-- no data survives. Each scenario uses SAVEPOINT for isolation.

\set ON_ERROR_STOP on
BEGIN;

-- Deterministic UUIDs for fixture sources
CREATE TEMP TABLE _bfix (
  key text PRIMARY KEY,
  val uuid NOT NULL
);
INSERT INTO _bfix VALUES
  ('src_a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('src_b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('user',  '00000000-0000-0000-0000-000000000001');

-- Force engine mode to a known baseline (scenarios override per-test)
INSERT INTO public.app_settings (key, value)
VALUES ('anchor_engine_mode', '"day_cut"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Helper: assert equal within tolerance (numeric(12,2) precision)
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(label text, expected numeric, actual numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF abs(COALESCE(actual,0) - COALESCE(expected,0)) < 0.005 THEN
    RAISE NOTICE 'PASS % — expected=%, actual=%', label, expected, actual;
  ELSE
    RAISE EXCEPTION 'FAIL % — expected=%, actual=%', label, expected, actual;
  END IF;
END;
$$;

-- Helper: reset fixture sources to unanchored zero balance
CREATE OR REPLACE FUNCTION pg_temp.reset_sources()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  DELETE FROM public.expenses
    WHERE user_id = (SELECT val FROM _bfix WHERE key='user');
  DELETE FROM public.custom_payment_sources
    WHERE id IN (SELECT val FROM _bfix WHERE key IN ('src_a','src_b'));
  INSERT INTO public.custom_payment_sources (id, user_id, name, balance,
    correction_anchor_date, correction_anchor_balance)
  VALUES
    ((SELECT val FROM _bfix WHERE key='src_a'),
     (SELECT val FROM _bfix WHERE key='user'), 'SRC_A', 0, NULL, NULL),
    ((SELECT val FROM _bfix WHERE key='src_b'),
     (SELECT val FROM _bfix WHERE key='user'), 'SRC_B', 0, NULL, NULL);
END;
$$;

-- Helper: set engine mode
CREATE OR REPLACE FUNCTION pg_temp.set_mode(m text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.app_settings (key, value)
  VALUES ('anchor_engine_mode', to_jsonb(m))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
$$;

-- Helper: atomarni SET sidra (BUG 2 remediation contract)
CREATE OR REPLACE FUNCTION pg_temp.set_anchor(p_src uuid, p_date timestamptz, p_bal numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.custom_payment_sources
    SET correction_anchor_date = p_date,
        correction_anchor_balance = p_bal
    WHERE id = p_src;
  PERFORM public.recompute_custom_source_balance(p_src);
END;
$$;

-- Helper: read stored balance
CREATE OR REPLACE FUNCTION pg_temp.bal(p_src uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT balance FROM public.custom_payment_sources WHERE id = p_src;
$$;

-- Helper: insert an expense row (returns id)
CREATE OR REPLACE FUNCTION pg_temp.mk_expense(
  p_type text,
  p_amount numeric,
  p_src uuid,
  p_date timestamptz,
  p_event_at timestamptz DEFAULT NULL,
  p_tc text DEFAULT NULL,
  p_nature text DEFAULT 'regular',
  p_dst uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.expenses (
    id, user_id, type, amount, payment_source, income_source_id,
    date, event_at, time_confidence, expense_nature, description, category
  ) VALUES (
    v_id,
    (SELECT val FROM _bfix WHERE key='user'),
    p_type, p_amount,
    CASE WHEN p_src IS NULL THEN NULL ELSE 'custom:' || p_src::text END,
    p_dst,
    p_date, p_event_at, p_tc, p_nature,
    'harness', 'harness'
  );
  RETURN v_id;
END;
$$;

SAVEPOINT before_scenarios;
