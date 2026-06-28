
-- Val 3 — engine execution pass
-- 1) Feature flag default
INSERT INTO public.app_settings (key, value)
VALUES ('anchor_engine_mode', '"day_cut"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Hybrid-aware recompute, gated by app_settings.anchor_engine_mode
CREATE OR REPLACE FUNCTION public.recompute_custom_source_balance(p_source_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anchor_date timestamptz;
  v_anchor_balance numeric(12,2);
  v_sum numeric(12,2) := 0;
  v_new_balance numeric(12,2);
  v_mode text;
BEGIN
  SELECT correction_anchor_date, correction_anchor_balance
    INTO v_anchor_date, v_anchor_balance
    FROM public.custom_payment_sources
    WHERE id = p_source_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Unanchored sources: do NOT touch balance (incremental delta path handles it)
  IF v_anchor_date IS NULL OR v_anchor_balance IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(value #>> '{}', 'day_cut') INTO v_mode
    FROM public.app_settings WHERE key = 'anchor_engine_mode';
  IF v_mode IS NULL THEN v_mode := 'day_cut'; END IF;

  IF v_mode = 'hybrid' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      )
      AND (
        (e.time_confidence IN ('C1','C2') AND e.event_at IS NOT NULL AND e.event_at > v_anchor_date)
        OR
        ((e.time_confidence IS NULL OR e.time_confidence IN ('C3','C4'))
          AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date)
      );
  ELSE
    -- day_cut (Rule B) — staro ponašanje, nepromijenjeno
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      );
  END IF;

  v_new_balance := v_anchor_balance + v_sum;

  UPDATE public.custom_payment_sources
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_source_id;

  RETURN v_new_balance;
END;
$$;

-- 3) Read-only preview — NIKAD ne pišu u tablice
CREATE OR REPLACE FUNCTION public.recompute_custom_source_balance_preview(
  p_source_id uuid,
  p_mode text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anchor_date timestamptz;
  v_anchor_balance numeric(12,2);
  v_sum numeric(12,2) := 0;
BEGIN
  IF p_mode NOT IN ('day_cut','hybrid') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;

  SELECT correction_anchor_date, correction_anchor_balance
    INTO v_anchor_date, v_anchor_balance
    FROM public.custom_payment_sources
    WHERE id = p_source_id;

  IF NOT FOUND OR v_anchor_date IS NULL OR v_anchor_balance IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_mode = 'hybrid' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      )
      AND (
        (e.time_confidence IN ('C1','C2') AND e.event_at IS NOT NULL AND e.event_at > v_anchor_date)
        OR
        ((e.time_confidence IS NULL OR e.time_confidence IN ('C3','C4'))
          AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date)
      );
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      );
  END IF;

  RETURN v_anchor_balance + v_sum;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_custom_source_balance_preview(uuid, text) TO authenticated;
