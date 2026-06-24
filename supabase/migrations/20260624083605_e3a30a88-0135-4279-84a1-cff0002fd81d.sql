
-- 1) Add anchor columns
ALTER TABLE public.custom_payment_sources
  ADD COLUMN IF NOT EXISTS correction_anchor_date timestamptz,
  ADD COLUMN IF NOT EXISTS correction_anchor_balance numeric(12,2);

-- 2) Helper: extract source UUID from 'custom:UUID' payment_source string
CREATE OR REPLACE FUNCTION public._extract_custom_source_id(p_payment_source text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_payment_source IS NULL THEN NULL
    WHEN p_payment_source LIKE 'custom:%' THEN
      NULLIF(substring(p_payment_source FROM 8), '')::uuid
    ELSE NULL
  END
$$;

-- 3) Recompute balance for a custom source based on anchor + post-anchor transactions
CREATE OR REPLACE FUNCTION public.recompute_custom_source_balance(p_source_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anchor_date timestamptz;
  v_anchor_balance numeric(12,2);
  v_owner uuid;
  v_sum numeric(12,2) := 0;
  v_new_balance numeric(12,2);
BEGIN
  SELECT correction_anchor_date, correction_anchor_balance, user_id
    INTO v_anchor_date, v_anchor_balance, v_owner
    FROM public.custom_payment_sources
    WHERE id = p_source_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- If no anchor: behave like "sum from zero" of all non-correction, non-deleted txns
  IF v_anchor_date IS NULL OR v_anchor_balance IS NULL THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type = 'income' AND public._extract_custom_source_id(e.payment_source) = p_source_id THEN e.amount
        WHEN e.type = 'expense' AND public._extract_custom_source_id(e.payment_source) = p_source_id THEN -e.amount
        WHEN e.type = 'transfer' AND public._extract_custom_source_id(e.payment_source) = p_source_id THEN -e.amount
        WHEN e.type = 'transfer' AND e.income_source_id = p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature, 'regular') <> 'correction'
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      );

    v_new_balance := v_sum;
  ELSE
    -- Anchor mode: count only transactions whose DAY is strictly after the anchor's DAY
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type = 'income' AND public._extract_custom_source_id(e.payment_source) = p_source_id THEN e.amount
        WHEN e.type = 'expense' AND public._extract_custom_source_id(e.payment_source) = p_source_id THEN -e.amount
        WHEN e.type = 'transfer' AND public._extract_custom_source_id(e.payment_source) = p_source_id THEN -e.amount
        WHEN e.type = 'transfer' AND e.income_source_id = p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature, 'regular') <> 'correction'
      AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      );

    v_new_balance := v_anchor_balance + v_sum;
  END IF;

  UPDATE public.custom_payment_sources
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_source_id;

  RETURN v_new_balance;
END;
$$;

-- 4) Trigger function: on expenses change, recompute affected source(s)
CREATE OR REPLACE FUNCTION public._expenses_recompute_source_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_src uuid;
  v_new_src uuid;
  v_old_dst uuid;
  v_new_dst uuid;
  v_affected uuid[];
  v_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_old_src := public._extract_custom_source_id(OLD.payment_source);
    v_old_dst := CASE WHEN OLD.type = 'transfer' THEN OLD.income_source_id ELSE NULL END;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_new_src := public._extract_custom_source_id(NEW.payment_source);
    v_new_dst := CASE WHEN NEW.type = 'transfer' THEN NEW.income_source_id ELSE NULL END;
  END IF;

  v_affected := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[v_old_src, v_new_src, v_old_dst, v_new_dst]) AS t(x)
    WHERE x IS NOT NULL
  );

  FOREACH v_id IN ARRAY v_affected LOOP
    PERFORM public.recompute_custom_source_balance(v_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_recompute_source_balance ON public.expenses;
CREATE TRIGGER trg_expenses_recompute_source_balance
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public._expenses_recompute_source_balance();

-- 5) Backfill anchor for sources that have a correction history
WITH latest_corr AS (
  SELECT DISTINCT ON (public._extract_custom_source_id(e.payment_source))
    public._extract_custom_source_id(e.payment_source) AS source_id,
    e.created_at AS corr_created_at,
    e.date AS corr_date
  FROM public.expenses e
  WHERE e.expense_nature = 'correction'
    AND e.deleted_at IS NULL
    AND e.payment_source LIKE 'custom:%'
  ORDER BY public._extract_custom_source_id(e.payment_source), e.created_at DESC
)
UPDATE public.custom_payment_sources cps
SET
  correction_anchor_date = lc.corr_date,
  correction_anchor_balance = cps.balance - COALESCE((
    SELECT SUM(
      CASE
        WHEN e.type = 'income' AND public._extract_custom_source_id(e.payment_source) = cps.id THEN e.amount
        WHEN e.type = 'expense' AND public._extract_custom_source_id(e.payment_source) = cps.id THEN -e.amount
        WHEN e.type = 'transfer' AND public._extract_custom_source_id(e.payment_source) = cps.id THEN -e.amount
        WHEN e.type = 'transfer' AND e.income_source_id = cps.id THEN e.amount
        ELSE 0
      END
    )
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature, 'regular') <> 'correction'
      AND e.created_at > lc.corr_created_at
      AND (
        public._extract_custom_source_id(e.payment_source) = cps.id
        OR e.income_source_id = cps.id
      )
  ), 0)
FROM latest_corr lc
WHERE cps.id = lc.source_id;

-- 6) Recompute all sources that now have an anchor (this will FIX the buggy balances)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.custom_payment_sources WHERE correction_anchor_date IS NOT NULL LOOP
    PERFORM public.recompute_custom_source_balance(r.id);
  END LOOP;
END $$;
