
-- 1) Restore old balances + clear anchors (osim Tekući zaštićeni)
WITH affected AS (
  SELECT
    cps.id,
    cps.correction_anchor_balance + COALESCE((
      WITH latest_corr AS (
        SELECT c.created_at
        FROM public.expenses c
        WHERE c.expense_nature = 'correction'
          AND c.deleted_at IS NULL
          AND public._extract_custom_source_id(c.payment_source) = cps.id
        ORDER BY c.created_at DESC
        LIMIT 1
      )
      SELECT SUM(CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=cps.id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=cps.id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=cps.id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=cps.id THEN e.amount
        ELSE 0
      END)
      FROM public.expenses e, latest_corr lc
      WHERE e.deleted_at IS NULL
        AND COALESCE(e.expense_nature,'regular') <> 'correction'
        AND e.created_at > lc.created_at
        AND (
          public._extract_custom_source_id(e.payment_source) = cps.id
          OR e.income_source_id = cps.id
        )
    ), 0) AS restored_balance
  FROM public.custom_payment_sources cps
  WHERE cps.correction_anchor_date IS NOT NULL
    AND cps.id <> '99f9425d-f37c-44ea-81b9-3d10e311b44d'  -- Tekući zaštićeni ostaje
)
UPDATE public.custom_payment_sources cps
SET balance = a.restored_balance,
    correction_anchor_date = NULL,
    correction_anchor_balance = NULL,
    updated_at = now()
FROM affected a
WHERE cps.id = a.id;

-- 2) Recompute function: no-op kad nema anchora (umjesto sum-from-zero)
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

  v_new_balance := v_anchor_balance + v_sum;

  UPDATE public.custom_payment_sources
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_source_id;

  RETURN v_new_balance;
END;
$$;

-- 3) Delta RPC: primijeni +/- iznos samo ako izvor nema sidro
CREATE OR REPLACE FUNCTION public.apply_balance_delta_if_unanchored(
  p_source_id uuid,
  p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new numeric;
BEGIN
  UPDATE public.custom_payment_sources
    SET balance = balance + p_delta,
        updated_at = now()
    WHERE id = p_source_id
      AND correction_anchor_date IS NULL
    RETURNING balance INTO v_new;
  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_balance_delta_if_unanchored(uuid, numeric) TO authenticated;
