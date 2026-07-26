-- =========================================================================
-- Krug Settlement Faza A — read-only temelj
-- Additive, schema-only. NULA izmjena na expenses / custom_payment_sources /
-- balance triggerima / anchor sustavu.
-- =========================================================================

-- 1) Split mode enum
CREATE TYPE public.krug_split_mode AS ENUM ('equal','proportional_income','manual');

-- 2) Krug: split_mode + settlement_currency
ALTER TABLE public.krug
  ADD COLUMN split_mode public.krug_split_mode NOT NULL DEFAULT 'equal',
  ADD COLUMN settlement_currency text;

-- 3) Per-Krug ručno deklarirani income ratio (owner postavlja)
CREATE TABLE public.krug_income_ratio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight numeric(10,4) NOT NULL CHECK (weight >= 0),
  effective_from date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (krug_id, user_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.krug_income_ratio TO authenticated;
GRANT ALL ON public.krug_income_ratio TO service_role;

ALTER TABLE public.krug_income_ratio ENABLE ROW LEVEL SECURITY;

-- Full members read
CREATE POLICY "krug_income_ratio_full_members_read"
  ON public.krug_income_ratio
  FOR SELECT
  TO authenticated
  USING (public.krug_is_full_member(krug_id, auth.uid()));

-- Owner write (insert / update / delete)
CREATE POLICY "krug_income_ratio_owner_insert"
  ON public.krug_income_ratio
  FOR INSERT
  TO authenticated
  WITH CHECK (public.krug_is_owner(krug_id, auth.uid()));

CREATE POLICY "krug_income_ratio_owner_update"
  ON public.krug_income_ratio
  FOR UPDATE
  TO authenticated
  USING (public.krug_is_owner(krug_id, auth.uid()))
  WITH CHECK (public.krug_is_owner(krug_id, auth.uid()));

CREATE POLICY "krug_income_ratio_owner_delete"
  ON public.krug_income_ratio
  FOR DELETE
  TO authenticated
  USING (public.krug_is_owner(krug_id, auth.uid()));

CREATE INDEX idx_krug_income_ratio_krug_user ON public.krug_income_ratio(krug_id, user_id, effective_from DESC);

-- updated_at trigger
CREATE TRIGGER krug_income_ratio_touch
  BEFORE UPDATE ON public.krug_income_ratio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 4) RPC krug_settlement_preview — SECURITY DEFINER, gate krug_is_full_member
-- =========================================================================
CREATE OR REPLACE FUNCTION public.krug_settlement_preview(
  p_krug_id uuid,
  p_period_start date,
  p_period_end date,
  p_display_currency text DEFAULT NULL,
  p_fx_rates jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_split_mode public.krug_split_mode;
  v_settlement_currency text;
  v_display_currency text;
  v_members uuid[];
  v_member_count int;
  v_mixed_currencies boolean := false;
  v_missing_income boolean := false;
  v_manual_fallback boolean := false;
  v_paid jsonb := '{}'::jsonb;
  v_owed jsonb := '{}'::jsonb;
  v_weights jsonb := '{}'::jsonb;
  v_weights_sum numeric := 0;
  v_rates_used jsonb := '{}'::jsonb;
  v_members_out jsonb := '[]'::jsonb;
  v_transfers_out jsonb := '[]'::jsonb;
  r record;
  m_uid uuid;
  v_amount_display numeric;
  v_rate_from numeric;
  v_rate_to numeric;
  v_share numeric;
  v_paid_v numeric;
  v_owed_v numeric;
  v_net numeric;
  -- greedy netting arrays
  v_debtors jsonb;
  v_creditors jsonb;
  v_epsilon numeric := 0.01;
BEGIN
  -- Gate
  IF NOT public.krug_is_full_member(p_krug_id, auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  -- Load krug config
  SELECT split_mode, settlement_currency
    INTO v_split_mode, v_settlement_currency
  FROM public.krug WHERE id = p_krug_id;

  -- Determine display currency
  v_display_currency := COALESCE(
    p_display_currency,
    v_settlement_currency,
    (
      SELECT cps.currency
      FROM public.krug_shared_payment_source kss
      JOIN public.custom_payment_sources cps
        ON ('custom:' || cps.id::text) = kss.payment_source_id
      WHERE kss.krug_id = p_krug_id
      ORDER BY kss.linked_at ASC
      LIMIT 1
    ),
    'EUR'
  );

  -- Members = owner + punopravni membership
  SELECT array_agg(DISTINCT uid)
    INTO v_members
  FROM (
    SELECT user_id AS uid FROM public.krug_ownership WHERE krug_id = p_krug_id
    UNION
    SELECT user_id AS uid FROM public.krug_membership
     WHERE krug_id = p_krug_id AND role = 'punopravni'::public.krug_membership_role
  ) s;

  v_member_count := COALESCE(array_length(v_members, 1), 0);

  IF v_member_count = 0 THEN
    RETURN jsonb_build_object(
      'krug_id', p_krug_id,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'display_currency', v_display_currency,
      'split_mode', v_split_mode,
      'members', '[]'::jsonb,
      'transfers', '[]'::jsonb,
      'fx', jsonb_build_object('rates_used', '{}'::jsonb, 'snapshot_date', current_date, 'source', 'client'),
      'flags', jsonb_build_object('missing_income_data', false, 'manual_mode_fallback_equal', false, 'mixed_currencies', false, 'no_members', true)
    );
  END IF;

  -- Init paid/owed per member
  FOREACH m_uid IN ARRAY v_members LOOP
    v_paid := jsonb_set(v_paid, ARRAY[m_uid::text], '0'::jsonb);
    v_owed := jsonb_set(v_owed, ARRAY[m_uid::text], '0'::jsonb);
  END LOOP;

  -- Compute weights per split mode
  IF v_split_mode = 'proportional_income' THEN
    FOREACH m_uid IN ARRAY v_members LOOP
      DECLARE w numeric;
      BEGIN
        SELECT weight INTO w
        FROM public.krug_income_ratio
        WHERE krug_id = p_krug_id
          AND user_id = m_uid
          AND effective_from <= p_period_end
        ORDER BY effective_from DESC
        LIMIT 1;
        IF w IS NULL THEN
          v_missing_income := true;
          w := 0;
        END IF;
        v_weights := jsonb_set(v_weights, ARRAY[m_uid::text], to_jsonb(w));
        v_weights_sum := v_weights_sum + w;
      END;
    END LOOP;
    IF v_missing_income OR v_weights_sum = 0 THEN
      -- fallback equal
      v_weights := '{}'::jsonb;
      v_weights_sum := 0;
      FOREACH m_uid IN ARRAY v_members LOOP
        v_weights := jsonb_set(v_weights, ARRAY[m_uid::text], to_jsonb(1::numeric));
        v_weights_sum := v_weights_sum + 1;
      END LOOP;
    END IF;
  ELSE
    -- equal & manual (Phase A: manual = equal)
    IF v_split_mode = 'manual' THEN
      v_manual_fallback := true;
    END IF;
    FOREACH m_uid IN ARRAY v_members LOOP
      v_weights := jsonb_set(v_weights, ARRAY[m_uid::text], to_jsonb(1::numeric));
      v_weights_sum := v_weights_sum + 1;
    END LOOP;
  END IF;

  -- Iterate over shared confirmed expenses in period
  FOR r IN
    SELECT
      e.user_id AS payer,
      COALESCE(e.currency, 'EUR') AS currency,
      e.amount
    FROM public.expenses e
    WHERE e.krug_id = p_krug_id
      AND e.krug_privacy = 'shared'::public.krug_privacy
      AND e.krug_shared_status = 'potvrdjena'::public.krug_shared_status
      AND e.deleted_at IS NULL
      AND e.type = 'expense'
      AND e.date::date BETWEEN p_period_start AND p_period_end
  LOOP
    -- FX: rates are relative to EUR (from useExchangeRates convention)
    IF r.currency = v_display_currency THEN
      v_amount_display := r.amount;
    ELSE
      v_mixed_currencies := true;
      v_rate_from := NULLIF((p_fx_rates ->> r.currency), '')::numeric;
      v_rate_to := NULLIF((p_fx_rates ->> v_display_currency), '')::numeric;
      IF r.currency = 'EUR' THEN v_rate_from := 1; END IF;
      IF v_display_currency = 'EUR' THEN v_rate_to := 1; END IF;
      IF v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0 THEN
        -- unknown rate → skip conversion, treat 1:1 and flag
        v_amount_display := r.amount;
      ELSE
        v_amount_display := (r.amount / v_rate_from) * v_rate_to;
      END IF;
      v_rates_used := v_rates_used
        || jsonb_build_object(r.currency || '->' || v_display_currency,
             CASE WHEN v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0
                  THEN NULL ELSE v_rate_to / v_rate_from END);
    END IF;

    -- paid += full amount to payer (only if payer is a full member)
    IF r.payer = ANY(v_members) THEN
      v_paid := jsonb_set(v_paid, ARRAY[r.payer::text],
        to_jsonb(((v_paid ->> r.payer::text)::numeric) + v_amount_display));
    END IF;

    -- owed distributed by weights
    FOREACH m_uid IN ARRAY v_members LOOP
      v_share := v_amount_display * ((v_weights ->> m_uid::text)::numeric) / v_weights_sum;
      v_owed := jsonb_set(v_owed, ARRAY[m_uid::text],
        to_jsonb(((v_owed ->> m_uid::text)::numeric) + v_share));
    END LOOP;
  END LOOP;

  -- Build members output + collect nets for netting
  v_debtors := '[]'::jsonb;   -- negative net (paid < owed → duguje)
  v_creditors := '[]'::jsonb; -- positive net (paid > owed → duguje mu se)

  FOREACH m_uid IN ARRAY v_members LOOP
    v_paid_v := round(((v_paid ->> m_uid::text)::numeric), 2);
    v_owed_v := round(((v_owed ->> m_uid::text)::numeric), 2);
    v_net := round(v_paid_v - v_owed_v, 2);

    v_members_out := v_members_out || jsonb_build_array(jsonb_build_object(
      'user_id', m_uid,
      'paid', v_paid_v,
      'owed', v_owed_v,
      'net', v_net
    ));

    IF v_net < -v_epsilon THEN
      v_debtors := v_debtors || jsonb_build_array(jsonb_build_object('user_id', m_uid, 'amount', -v_net));
    ELSIF v_net > v_epsilon THEN
      v_creditors := v_creditors || jsonb_build_array(jsonb_build_object('user_id', m_uid, 'amount', v_net));
    END IF;
  END LOOP;

  -- Greedy netting inside PL/pgSQL using jsonb arrays
  DECLARE
    d_idx int := 0;
    c_idx int := 0;
    d_len int;
    c_len int;
    d_amt numeric;
    c_amt numeric;
    d_uid uuid;
    c_uid uuid;
    transfer_amt numeric;
    tmp jsonb;
  BEGIN
    -- Sort debtors desc by amount
    SELECT jsonb_agg(x ORDER BY (x->>'amount')::numeric DESC) INTO tmp FROM jsonb_array_elements(v_debtors) x;
    v_debtors := COALESCE(tmp, '[]'::jsonb);
    SELECT jsonb_agg(x ORDER BY (x->>'amount')::numeric DESC) INTO tmp FROM jsonb_array_elements(v_creditors) x;
    v_creditors := COALESCE(tmp, '[]'::jsonb);

    d_len := jsonb_array_length(v_debtors);
    c_len := jsonb_array_length(v_creditors);

    WHILE d_idx < d_len AND c_idx < c_len LOOP
      d_uid := ((v_debtors -> d_idx) ->> 'user_id')::uuid;
      c_uid := ((v_creditors -> c_idx) ->> 'user_id')::uuid;
      d_amt := ((v_debtors -> d_idx) ->> 'amount')::numeric;
      c_amt := ((v_creditors -> c_idx) ->> 'amount')::numeric;

      transfer_amt := round(LEAST(d_amt, c_amt), 2);

      IF transfer_amt > v_epsilon THEN
        v_transfers_out := v_transfers_out || jsonb_build_array(jsonb_build_object(
          'from_user', d_uid,
          'to_user', c_uid,
          'amount', transfer_amt,
          'currency', v_display_currency
        ));
      END IF;

      IF d_amt - transfer_amt <= v_epsilon THEN
        d_idx := d_idx + 1;
      ELSE
        v_debtors := jsonb_set(v_debtors, ARRAY[d_idx::text, 'amount'], to_jsonb(d_amt - transfer_amt));
      END IF;

      IF c_amt - transfer_amt <= v_epsilon THEN
        c_idx := c_idx + 1;
      ELSE
        v_creditors := jsonb_set(v_creditors, ARRAY[c_idx::text, 'amount'], to_jsonb(c_amt - transfer_amt));
      END IF;
    END LOOP;
  END;

  RETURN jsonb_build_object(
    'krug_id', p_krug_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'display_currency', v_display_currency,
    'split_mode', v_split_mode,
    'members', v_members_out,
    'transfers', v_transfers_out,
    'fx', jsonb_build_object(
      'rates_used', v_rates_used,
      'snapshot_date', current_date,
      'source', 'client'
    ),
    'flags', jsonb_build_object(
      'missing_income_data', v_missing_income,
      'manual_mode_fallback_equal', v_manual_fallback,
      'mixed_currencies', v_mixed_currencies
    )
  );
END;
$$;

-- Only authenticated may call; SECURITY DEFINER runs as function owner
REVOKE EXECUTE ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) TO authenticated;
