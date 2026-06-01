
-- ============================================================
-- FAZA 2 — KORAK 2: RPC funkcije za proporcionalnu podjelu
-- ============================================================

-- 1) compute_family_income_ratio
-- Vraća red po članu s prihodima i izračunatim omjerom.
CREATE OR REPLACE FUNCTION public.compute_family_income_ratio(p_group_id uuid)
RETURNS TABLE (
  user_id uuid,
  consent boolean,
  declared_income numeric,
  declared_currency text,
  monthly_contribution numeric,
  auto_3m_income numeric,
  effective_income numeric,
  ratio numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_total numeric;
BEGIN
  -- Authorization
  IF NOT public.is_family_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT split_income_source INTO v_source
  FROM public.family_groups WHERE id = p_group_id;

  CREATE TEMP TABLE _ratios ON COMMIT DROP AS
  WITH members AS (
    SELECT fm.user_id, fm.income_share_consent AS consent,
           fm.declared_monthly_income AS declared_income,
           fm.declared_income_currency AS declared_currency,
           fm.monthly_contribution
    FROM public.family_members fm
    WHERE fm.group_id = p_group_id
  ),
  incomes AS (
    SELECT m.user_id,
      COALESCE((
        SELECT SUM(e.amount) / 3.0
        FROM public.expenses e
        WHERE e.user_id = m.user_id
          AND e.type = 'income'
          AND e.deleted_at IS NULL
          AND e.date >= (now() - interval '90 days')
      ), 0) AS auto_3m
    FROM members m
  )
  SELECT
    m.user_id,
    m.consent,
    m.declared_income,
    m.declared_currency,
    m.monthly_contribution,
    i.auto_3m AS auto_3m_income,
    CASE
      WHEN NOT m.consent THEN 0
      WHEN v_source = 'declared' THEN COALESCE(m.declared_income, 0) + COALESCE(m.monthly_contribution, 0)
      WHEN v_source = 'auto_3m' THEN i.auto_3m + COALESCE(m.monthly_contribution, 0)
      ELSE COALESCE(m.declared_income, i.auto_3m) + COALESCE(m.monthly_contribution, 0)
    END AS effective_income
  FROM members m
  LEFT JOIN incomes i ON i.user_id = m.user_id;

  SELECT NULLIF(SUM(effective_income), 0) INTO v_total FROM _ratios;

  RETURN QUERY
  SELECT r.user_id, r.consent, r.declared_income, r.declared_currency,
         r.monthly_contribution, r.auto_3m_income, r.effective_income,
         CASE WHEN v_total IS NULL OR v_total = 0 THEN 0
              ELSE ROUND(r.effective_income / v_total, 6) END AS ratio
  FROM _ratios r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_family_income_ratio(uuid) TO authenticated;


-- 2) refresh_family_split_snapshot
-- Osvježava snapshot za zadani period (jedan red po članu).
CREATE OR REPLACE FUNCTION public.refresh_family_split_snapshot(
  p_group_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_currency text;
  v_shared_categories text[];
  v_shared_total numeric := 0;
  v_member_count int;
BEGIN
  IF NOT public.is_family_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT split_mode, currency, shared_categories
    INTO v_mode, v_currency, v_shared_categories
  FROM public.family_groups WHERE id = p_group_id;

  -- Brisanje starog snapshota za period
  DELETE FROM public.family_split_snapshots
  WHERE group_id = p_group_id
    AND period_start = p_period_start
    AND period_end = p_period_end;

  -- Lista shared payment_source UUID-eva
  CREATE TEMP TABLE _shared_src ON COMMIT DROP AS
  SELECT payment_source_id FROM public.family_shared_sources WHERE group_id = p_group_id;

  -- Eligible (shared) transakcije: na shared source-u, type=expense, ne private, ne deleted,
  -- u periodu, i (ako su definirane shared kategorije) — kategorija je u njima.
  CREATE TEMP TABLE _shared_exp ON COMMIT DROP AS
  SELECT e.id, e.user_id, e.amount, e.category, e.split_overrides
  FROM public.expenses e
  WHERE e.deleted_at IS NULL
    AND e.type = 'expense'
    AND COALESCE(e.is_private, false) = false
    AND e.date::date BETWEEN p_period_start AND p_period_end
    AND e.payment_source LIKE 'custom:%'
    AND substring(e.payment_source from 8)::uuid IN (SELECT payment_source_id FROM _shared_src)
    AND (
      array_length(v_shared_categories, 1) IS NULL
      OR e.category = ANY(v_shared_categories)
    );

  SELECT COALESCE(SUM(amount), 0) INTO v_shared_total FROM _shared_exp;

  -- Omjeri po članu
  CREATE TEMP TABLE _ratios ON COMMIT DROP AS
  SELECT * FROM public.compute_family_income_ratio(p_group_id);

  SELECT COUNT(*) INTO v_member_count FROM _ratios;
  IF v_member_count = 0 THEN
    RETURN;
  END IF;

  -- "Owed" po članu: per-transakciju primijeni override ako postoji,
  -- inače globalni omjer (equal/proportional/manual fallback = equal).
  WITH per_member_owed AS (
    SELECT
      m.user_id,
      COALESCE(SUM(
        CASE
          -- Override iz transakcije (po user_id key u jsonb)
          WHEN e.split_overrides IS NOT NULL
               AND e.split_overrides ? m.user_id::text
            THEN e.amount * (e.split_overrides ->> m.user_id::text)::numeric
          -- Proporcionalno po prihodu
          WHEN v_mode = 'proportional_income'
            THEN e.amount * COALESCE(r.ratio, 0)
          -- Equal / manual (manual fallback)
          ELSE e.amount / v_member_count::numeric
        END
      ), 0) AS owed
    FROM _ratios m
    CROSS JOIN _shared_exp e
    LEFT JOIN _ratios r ON r.user_id = m.user_id
    GROUP BY m.user_id
  ),
  per_member_paid AS (
    SELECT e.user_id, COALESCE(SUM(e.amount), 0) AS paid
    FROM _shared_exp e
    GROUP BY e.user_id
  )
  INSERT INTO public.family_split_snapshots
    (group_id, period_start, period_end, member_user_id,
     shared_total, share_ratio, owed, paid, currency, computed_at)
  SELECT
    p_group_id, p_period_start, p_period_end, m.user_id,
    v_shared_total,
    COALESCE(r.ratio, 0),
    COALESCE(o.owed, 0),
    COALESCE(p.paid, 0),
    v_currency,
    now()
  FROM _ratios m
  LEFT JOIN _ratios r ON r.user_id = m.user_id
  LEFT JOIN per_member_owed o ON o.user_id = m.user_id
  LEFT JOIN per_member_paid p ON p.user_id = m.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_family_split_snapshot(uuid, date, date) TO authenticated;


-- 3) compute_family_settlements
-- Greedy netting algoritam: tko ima paid - owed > 0 = vjerovnik, < 0 = dužnik.
-- Briše pending settlements za period i upisuje nove.
CREATE OR REPLACE FUNCTION public.compute_family_settlements(
  p_group_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
  v_debtor record;
  v_creditor record;
  v_amount numeric;
BEGIN
  IF NOT public.is_family_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT currency INTO v_currency FROM public.family_groups WHERE id = p_group_id;

  -- Brišemo samo pending settlements za period (paid ostaju kao povijest)
  DELETE FROM public.family_settlements
  WHERE group_id = p_group_id
    AND period_start = p_period_start
    AND period_end = p_period_end
    AND status = 'pending';

  -- Bilance: positive = vjerovnik (platio više nego što duguje), negative = dužnik
  CREATE TEMP TABLE _balances ON COMMIT DROP AS
  SELECT member_user_id AS user_id, ROUND(paid - owed, 2) AS balance
  FROM public.family_split_snapshots
  WHERE group_id = p_group_id
    AND period_start = p_period_start
    AND period_end = p_period_end;

  -- Greedy netting petlja
  LOOP
    SELECT user_id, balance INTO v_debtor
    FROM _balances
    WHERE balance < -0.01
    ORDER BY balance ASC
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    SELECT user_id, balance INTO v_creditor
    FROM _balances
    WHERE balance > 0.01
    ORDER BY balance DESC
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    v_amount := LEAST(ABS(v_debtor.balance), v_creditor.balance);
    v_amount := ROUND(v_amount, 2);

    IF v_amount < 0.01 THEN EXIT; END IF;

    INSERT INTO public.family_settlements
      (group_id, period_start, period_end, debtor_user_id, creditor_user_id,
       amount, currency, status)
    VALUES
      (p_group_id, p_period_start, p_period_end, v_debtor.user_id, v_creditor.user_id,
       v_amount, v_currency, 'pending');

    UPDATE _balances SET balance = balance + v_amount WHERE user_id = v_debtor.user_id;
    UPDATE _balances SET balance = balance - v_amount WHERE user_id = v_creditor.user_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_family_settlements(uuid, date, date) TO authenticated;


-- 4) record_settlement
-- Označava settlement plaćenim (opcionalno linka payment_expense_id).
CREATE OR REPLACE FUNCTION public.record_settlement(
  p_settlement_id uuid,
  p_payment_expense_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.family_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.family_settlements;
BEGIN
  SELECT * INTO v_row FROM public.family_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement not found'; END IF;

  IF NOT (
    public.is_family_owner(v_row.group_id, auth.uid())
    OR auth.uid() = v_row.debtor_user_id
    OR auth.uid() = v_row.creditor_user_id
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.family_settlements
  SET status = 'paid',
      paid_at = now(),
      payment_expense_id = COALESCE(p_payment_expense_id, payment_expense_id),
      note = COALESCE(p_note, note),
      updated_at = now()
  WHERE id = p_settlement_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_settlement(uuid, uuid, text) TO authenticated;


-- 5) apply_split_override
-- Validira i upisuje per-transaction override (suma ratio-a ~ 1.0) + audit.
CREATE OR REPLACE FUNCTION public.apply_split_override(
  p_expense_id uuid,
  p_overrides jsonb
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp public.expenses;
  v_sum numeric := 0;
  v_key text;
  v_val numeric;
  v_group_id uuid;
  v_before jsonb;
BEGIN
  SELECT * INTO v_exp FROM public.expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense not found'; END IF;

  -- Vlasnik transakcije može mijenjati override
  IF v_exp.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- NULL/empty = remove override
  IF p_overrides IS NULL OR p_overrides = '{}'::jsonb THEN
    v_before := v_exp.split_overrides;
    UPDATE public.expenses SET split_overrides = NULL, updated_at = now()
    WHERE id = p_expense_id RETURNING * INTO v_exp;
  ELSE
    -- Validacija: suma ratio-a 0.99 - 1.01
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_overrides) LOOP
      IF v_val::numeric < 0 OR v_val::numeric > 1 THEN
        RAISE EXCEPTION 'override ratio out of range';
      END IF;
      v_sum := v_sum + v_val::numeric;
    END LOOP;

    IF v_sum < 0.99 OR v_sum > 1.01 THEN
      RAISE EXCEPTION 'override sum must equal 1.0 (got %)', v_sum;
    END IF;

    v_before := v_exp.split_overrides;
    UPDATE public.expenses SET split_overrides = p_overrides, updated_at = now()
    WHERE id = p_expense_id RETURNING * INTO v_exp;
  END IF;

  -- Audit (pronađi group preko shared source-a, ako postoji)
  IF v_exp.payment_source LIKE 'custom:%' THEN
    SELECT fss.group_id INTO v_group_id
    FROM public.family_shared_sources fss
    WHERE fss.payment_source_id = substring(v_exp.payment_source from 8)::uuid
    LIMIT 1;

    IF v_group_id IS NOT NULL THEN
      INSERT INTO public.family_split_audit
        (group_id, user_id, action, entity_type, entity_id, before_data, after_data)
      VALUES
        (v_group_id, auth.uid(),
         CASE WHEN p_overrides IS NULL OR p_overrides = '{}'::jsonb
              THEN 'override_removed' ELSE 'override_applied' END,
         'expenses', p_expense_id,
         jsonb_build_object('split_overrides', v_before),
         jsonb_build_object('split_overrides', v_exp.split_overrides));
    END IF;
  END IF;

  RETURN v_exp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_split_override(uuid, jsonb) TO authenticated;
