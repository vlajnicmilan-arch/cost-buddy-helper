-- Krug „tko kome" za običnog člana, nalog 1: vidljivost.
-- Punopravni i vlasnik: preview nepromijenjen. Obični član: samo izravni parovi.

CREATE POLICY ledger_select_own_party ON public.krug_settlement_ledger
  FOR SELECT TO authenticated
  USING (public.krug_is_member(krug_id, auth.uid()) AND auth.uid() IN (from_user, to_user));

CREATE OR REPLACE FUNCTION public.krug_settlement_preview_own_party(
  p_krug_id uuid, p_user uuid, p_period_start date, p_period_end date,
  p_display_currency text, p_rates jsonb, p_split_mode public.krug_split_mode,
  p_fx_source text, p_fx_frozen boolean, p_frozen_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  s record;
  v_amt numeric;
  v_rate_from numeric;
  v_rate_to numeric;
  v_share numeric;
  v_paid numeric := 0;
  v_owed numeric := 0;
  v_adj numeric := 0;
  v_pair jsonb := '{}'::jsonb;  -- X -> koliko ja dugujem X-u (negativno = X duguje meni)
  v_rates_used jsonb := '{}'::jsonb;
  v_mixed boolean := false;
  v_has_overrides boolean := false;
  v_settled jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_net numeric;
  v_epsilon numeric := 0.01;
  k text;
BEGIN
  -- Samo troškovi s potvrđenim prijedlogom u kojima sam platitelj ili imam udio.
  FOR r IN
    SELECT e.id AS expense_id, e.user_id AS payer,
           COALESCE(e.currency,'EUR') AS currency,
           CASE WHEN ov.shared_amount IS NOT NULL
                THEN LEAST(ov.shared_amount, e.amount) ELSE e.amount END AS amount,
           ov.id AS override_id
    FROM public.expenses e
    JOIN LATERAL (
      SELECT o.id, o.shared_amount FROM public.krug_expense_split_override o
       WHERE o.expense_id = e.id AND o.status = 'potvrdjena' LIMIT 1
    ) ov ON true
    WHERE e.krug_id = p_krug_id
      AND e.krug_privacy = 'shared'::public.krug_privacy
      AND e.krug_shared_status = 'potvrdjena'::public.krug_shared_status
      AND e.deleted_at IS NULL AND e.type = 'expense'
      AND e.date::date BETWEEN p_period_start AND p_period_end
      AND (e.user_id = p_user OR EXISTS (
            SELECT 1 FROM public.krug_expense_split_share x
             WHERE x.override_id = ov.id AND x.user_id = p_user))
  LOOP
    v_has_overrides := true;
    IF r.currency = p_display_currency THEN
      v_amt := r.amount;
    ELSE
      v_mixed := true;
      v_rate_from := NULLIF((p_rates ->> r.currency), '')::numeric;
      v_rate_to := NULLIF((p_rates ->> p_display_currency), '')::numeric;
      IF r.currency = 'EUR' THEN v_rate_from := 1; END IF;
      IF p_display_currency = 'EUR' THEN v_rate_to := 1; END IF;
      IF v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0 THEN
        v_amt := r.amount;
      ELSE
        v_amt := (r.amount / v_rate_from) * v_rate_to;
      END IF;
      v_rates_used := v_rates_used
        || jsonb_build_object(r.currency || '->' || p_display_currency,
             CASE WHEN v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0
                  THEN NULL ELSE v_rate_to / v_rate_from END);
    END IF;

    IF r.payer = p_user THEN
      v_paid := v_paid + v_amt;
    END IF;

    FOR s IN SELECT x.user_id, x.share_percent FROM public.krug_expense_split_share x
              WHERE x.override_id = r.override_id
    LOOP
      v_share := v_amt * s.share_percent / 100.0;
      IF s.user_id = p_user THEN
        v_owed := v_owed + v_share;
        IF r.payer <> p_user THEN
          v_pair := jsonb_set(v_pair, ARRAY[r.payer::text],
            to_jsonb(COALESCE((v_pair ->> r.payer::text)::numeric, 0) + v_share));
        END IF;
      ELSIF r.payer = p_user THEN
        v_pair := jsonb_set(v_pair, ARRAY[s.user_id::text],
          to_jsonb(COALESCE((v_pair ->> s.user_id::text)::numeric, 0) - v_share));
      END IF;
    END LOOP;
  END LOOP;

  -- Podmirenja samo tamo gdje sam strana.
  FOR r IN
    SELECT l.id, l.from_user, l.to_user, l.amount, l.currency, l.marked_at
      FROM public.krug_settlement_ledger l
     WHERE l.krug_id = p_krug_id AND l.voided_at IS NULL
       AND l.marked_at::date BETWEEN p_period_start AND p_period_end
       AND p_user IN (l.from_user, l.to_user)
     ORDER BY l.marked_at, l.id
  LOOP
    IF r.currency = p_display_currency THEN
      v_amt := r.amount;
    ELSE
      v_rate_from := NULLIF((p_rates ->> r.currency), '')::numeric;
      v_rate_to := NULLIF((p_rates ->> p_display_currency), '')::numeric;
      IF r.currency = 'EUR' THEN v_rate_from := 1; END IF;
      IF p_display_currency = 'EUR' THEN v_rate_to := 1; END IF;
      IF v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0 THEN
        v_amt := r.amount;
      ELSE
        v_amt := (r.amount / v_rate_from) * v_rate_to;
      END IF;
    END IF;
    v_amt := round(v_amt, 2);

    v_settled := v_settled || jsonb_build_array(jsonb_build_object(
      'ledger_id', r.id, 'from_user', r.from_user, 'to_user', r.to_user,
      'amount', v_amt, 'currency', p_display_currency, 'marked_at', r.marked_at));

    IF r.from_user = p_user AND r.to_user <> p_user THEN
      v_adj := v_adj + v_amt;
      v_pair := jsonb_set(v_pair, ARRAY[r.to_user::text],
        to_jsonb(COALESCE((v_pair ->> r.to_user::text)::numeric, 0) - v_amt));
    ELSIF r.to_user = p_user AND r.from_user <> p_user THEN
      v_adj := v_adj - v_amt;
      v_pair := jsonb_set(v_pair, ARRAY[r.from_user::text],
        to_jsonb(COALESCE((v_pair ->> r.from_user::text)::numeric, 0) + v_amt));
    END IF;
  END LOOP;

  -- Izravni parovi, bez netiranja kroz treće.
  FOR k IN SELECT key FROM jsonb_object_keys(v_pair) key ORDER BY key LOOP
    v_net := round((v_pair ->> k)::numeric, 2);
    IF v_net > v_epsilon THEN
      v_transfers := v_transfers || jsonb_build_array(jsonb_build_object(
        'from_user', p_user, 'to_user', k::uuid, 'amount', v_net, 'currency', p_display_currency));
    ELSIF v_net < -v_epsilon THEN
      v_transfers := v_transfers || jsonb_build_array(jsonb_build_object(
        'from_user', k::uuid, 'to_user', p_user, 'amount', -v_net, 'currency', p_display_currency));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'krug_id', p_krug_id,
    'period_start', p_period_start, 'period_end', p_period_end,
    'display_currency', p_display_currency, 'split_mode', p_split_mode,
    'members', jsonb_build_array(jsonb_build_object(
      'user_id', p_user,
      'paid', round(v_paid, 2),
      'owed', round(v_owed, 2),
      'net', round(round(v_paid, 2) - round(v_owed, 2) + v_adj, 2))),
    'transfers', v_transfers,
    'settled_transfers', v_settled,
    'fx', jsonb_build_object(
      'rates_used', v_rates_used,
      'snapshot_date', current_date,
      'source', p_fx_source,
      'frozen', p_fx_frozen,
      'frozen_at', p_frozen_at),
    'flags', jsonb_build_object(
      'own_party_view', true,
      'mixed_currencies', v_mixed,
      'has_overrides', v_has_overrides)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_settlement_preview_own_party(uuid, uuid, date, date, text, jsonb, public.krug_split_mode, text, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_settlement_preview_own_party(uuid, uuid, date, date, text, jsonb, public.krug_split_mode, text, boolean, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_settlement_preview_own_party(uuid, uuid, date, date, text, jsonb, public.krug_split_mode, text, boolean, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.krug_settlement_preview(p_krug_id uuid, p_period_start date, p_period_end date, p_display_currency text DEFAULT NULL::text, p_fx_rates jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_split_mode public.krug_split_mode;
  v_settlement_currency text;
  v_display_currency text;
  v_members uuid[];
  v_member_count int;
  v_mixed_currencies boolean := false;
  v_missing_income boolean := false;
  v_manual_fallback boolean := false;
  v_has_overrides boolean := false;
  v_paid jsonb := '{}'::jsonb;
  v_owed jsonb := '{}'::jsonb;
  v_weights jsonb := '{}'::jsonb;
  v_weights_sum numeric := 0;
  v_rates_used jsonb := '{}'::jsonb;
  v_members_out jsonb := '[]'::jsonb;
  v_transfers_out jsonb := '[]'::jsonb;
  v_settled_out jsonb := '[]'::jsonb;
  r record;
  m_uid uuid;
  v_amount_display numeric;
  v_rate_from numeric;
  v_rate_to numeric;
  v_share numeric;
  v_paid_v numeric;
  v_owed_v numeric;
  v_net numeric;
  v_debtors jsonb;
  v_creditors jsonb;
  v_epsilon numeric := 0.01;
  v_override_id uuid;
  v_share_pct numeric;
  -- C1 additions
  v_snapshot_rates jsonb;
  v_snapshot_frozen_at timestamptz;
  v_snapshot_source text;
  v_effective_rates jsonb;
  v_fx_source text := 'client';
  v_fx_frozen boolean := false;
  v_own_party boolean := false;
BEGIN
  IF NOT public.krug_is_full_member(p_krug_id, auth.uid()) THEN
    -- Obični član: samo vlastiti odnosi (rezani odgovor ispod).
    IF NOT public.krug_is_member(p_krug_id, auth.uid()) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;
    v_own_party := true;
  END IF;
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  SELECT split_mode, settlement_currency
    INTO v_split_mode, v_settlement_currency
  FROM public.krug WHERE id = p_krug_id;

  v_display_currency := COALESCE(
    p_display_currency,
    v_settlement_currency,
    (SELECT cps.currency
       FROM public.krug_shared_payment_source kss
       JOIN public.custom_payment_sources cps
         ON ('custom:' || cps.id::text) = kss.payment_source_id
      WHERE kss.krug_id = p_krug_id
      ORDER BY kss.linked_at ASC LIMIT 1),
    'EUR'
  );

  -- C1: try to load frozen snapshot for this exact (krug, period, display_currency)
  SELECT s.rates, s.frozen_at, s.source
    INTO v_snapshot_rates, v_snapshot_frozen_at, v_snapshot_source
  FROM public.krug_settlement_fx_snapshot s
  WHERE s.krug_id = p_krug_id
    AND s.period_start = p_period_start
    AND s.period_end = p_period_end
    AND s.display_currency = v_display_currency
  LIMIT 1;

  IF v_snapshot_rates IS NOT NULL THEN
    v_effective_rates := v_snapshot_rates;
    v_fx_source := 'snapshot';
    v_fx_frozen := true;
  ELSE
    v_effective_rates := COALESCE(p_fx_rates, '{}'::jsonb);
  END IF;

  IF v_own_party THEN
    RETURN public.krug_settlement_preview_own_party(
      p_krug_id, auth.uid(), p_period_start, p_period_end, v_display_currency,
      v_effective_rates, v_split_mode, v_fx_source, v_fx_frozen, v_snapshot_frozen_at);
  END IF;

  SELECT array_agg(DISTINCT uid) INTO v_members
  FROM (
    SELECT user_id AS uid FROM public.krug_ownership WHERE krug_id = p_krug_id
    UNION
    SELECT user_id AS uid FROM public.krug_membership
     WHERE krug_id = p_krug_id AND role = 'punopravni'::public.krug_membership_role
  ) s;
  v_member_count := COALESCE(array_length(v_members, 1), 0);

  IF v_member_count = 0 THEN
    RETURN jsonb_build_object(
      'krug_id', p_krug_id, 'period_start', p_period_start, 'period_end', p_period_end,
      'display_currency', v_display_currency, 'split_mode', v_split_mode,
      'members', '[]'::jsonb, 'transfers', '[]'::jsonb, 'settled_transfers', '[]'::jsonb,
      'fx', jsonb_build_object(
        'rates_used','{}'::jsonb,
        'snapshot_date',current_date,
        'source', v_fx_source,
        'frozen', v_fx_frozen,
        'frozen_at', v_snapshot_frozen_at
      ),
      'flags', jsonb_build_object('missing_income_data',false,'manual_mode_fallback_equal',false,
                                  'mixed_currencies',false,'no_members',true,'has_overrides',false)
    );
  END IF;

  FOREACH m_uid IN ARRAY v_members LOOP
    v_paid := jsonb_set(v_paid, ARRAY[m_uid::text], '0'::jsonb);
    v_owed := jsonb_set(v_owed, ARRAY[m_uid::text], '0'::jsonb);
  END LOOP;

  -- Default weights (koriste se kad NEMA override na trošku)
  IF v_split_mode = 'proportional_income' THEN
    FOREACH m_uid IN ARRAY v_members LOOP
      DECLARE w numeric;
      BEGIN
        SELECT weight INTO w FROM public.krug_income_ratio
         WHERE krug_id = p_krug_id AND user_id = m_uid AND effective_from <= p_period_end
         ORDER BY effective_from DESC LIMIT 1;
        IF w IS NULL THEN v_missing_income := true; w := 0; END IF;
        v_weights := jsonb_set(v_weights, ARRAY[m_uid::text], to_jsonb(w));
        v_weights_sum := v_weights_sum + w;
      END;
    END LOOP;
    IF v_missing_income OR v_weights_sum = 0 THEN
      v_weights := '{}'::jsonb; v_weights_sum := 0;
      FOREACH m_uid IN ARRAY v_members LOOP
        v_weights := jsonb_set(v_weights, ARRAY[m_uid::text], to_jsonb(1::numeric));
        v_weights_sum := v_weights_sum + 1;
      END LOOP;
    END IF;
  ELSE
    IF v_split_mode = 'manual' THEN v_manual_fallback := true; END IF;
    FOREACH m_uid IN ARRAY v_members LOOP
      v_weights := jsonb_set(v_weights, ARRAY[m_uid::text], to_jsonb(1::numeric));
      v_weights_sum := v_weights_sum + 1;
    END LOOP;
  END IF;

  -- Iteriraj troškove; za svaki provjeri aktivan override
  FOR r IN
    SELECT e.id AS expense_id, e.user_id AS payer,
           COALESCE(e.currency,'EUR') AS currency,
           CASE WHEN ov.id IS NOT NULL AND ov.shared_amount IS NOT NULL
                THEN LEAST(ov.shared_amount, e.amount) ELSE e.amount END AS amount,
           ov.id AS override_id
    FROM public.expenses e
    LEFT JOIN LATERAL (
      SELECT o.id, o.shared_amount FROM public.krug_expense_split_override o
       WHERE o.expense_id = e.id AND o.status = 'potvrdjena' LIMIT 1
    ) ov ON true
    WHERE e.krug_id = p_krug_id
      AND e.krug_privacy = 'shared'::public.krug_privacy
      AND e.krug_shared_status = 'potvrdjena'::public.krug_shared_status
      AND e.deleted_at IS NULL AND e.type = 'expense'
      AND e.date::date BETWEEN p_period_start AND p_period_end
  LOOP
    IF r.currency = v_display_currency THEN
      v_amount_display := r.amount;
    ELSE
      v_mixed_currencies := true;
      v_rate_from := NULLIF((v_effective_rates ->> r.currency), '')::numeric;
      v_rate_to := NULLIF((v_effective_rates ->> v_display_currency), '')::numeric;
      IF r.currency = 'EUR' THEN v_rate_from := 1; END IF;
      IF v_display_currency = 'EUR' THEN v_rate_to := 1; END IF;
      IF v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0 THEN
        v_amount_display := r.amount;
      ELSE
        v_amount_display := (r.amount / v_rate_from) * v_rate_to;
      END IF;
      v_rates_used := v_rates_used
        || jsonb_build_object(r.currency || '->' || v_display_currency,
             CASE WHEN v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0
                  THEN NULL ELSE v_rate_to / v_rate_from END);
    END IF;

    IF r.payer = ANY(v_members) THEN
      v_paid := jsonb_set(v_paid, ARRAY[r.payer::text],
        to_jsonb(((v_paid ->> r.payer::text)::numeric) + v_amount_display));
    END IF;

    -- Override (i dijeljena svota) dolazi iz LATERAL spoja gore.
    v_override_id := r.override_id;

    IF v_override_id IS NOT NULL THEN
      v_has_overrides := true;
      FOR m_uid, v_share_pct IN
        SELECT s.user_id, s.share_percent FROM public.krug_expense_split_share s
         WHERE s.override_id = v_override_id
      LOOP
        v_share := v_amount_display * v_share_pct / 100.0;
        v_owed := jsonb_set(v_owed, ARRAY[m_uid::text],
          to_jsonb(COALESCE((v_owed ->> m_uid::text)::numeric,0) + v_share));
      END LOOP;
    ELSE
      FOREACH m_uid IN ARRAY v_members LOOP
        v_share := v_amount_display * ((v_weights ->> m_uid::text)::numeric) / v_weights_sum;
        v_owed := jsonb_set(v_owed, ARRAY[m_uid::text],
          to_jsonb(((v_owed ->> m_uid::text)::numeric) + v_share));
      END LOOP;
    END IF;
  END LOOP;

  -- Build member rows i skupi settled transfere za korekciju netova
  v_debtors := '[]'::jsonb; v_creditors := '[]'::jsonb;

  FOREACH m_uid IN ARRAY v_members LOOP
    v_paid_v := round(((v_paid ->> m_uid::text)::numeric), 2);
    v_owed_v := round(((v_owed ->> m_uid::text)::numeric), 2);
    v_net := round(v_paid_v - v_owed_v, 2);

    v_members_out := v_members_out || jsonb_build_array(jsonb_build_object(
      'user_id', m_uid, 'paid', v_paid_v, 'owed', v_owed_v, 'net', v_net
    ));
  END LOOP;

  -- Primijeni settled ledger korekciju: konvertiraj u display currency
  FOR r IN
    SELECT l.id, l.from_user, l.to_user, l.amount, l.currency, l.marked_at
      FROM public.krug_settlement_ledger l
     WHERE l.krug_id = p_krug_id AND l.voided_at IS NULL
       AND l.marked_at::date BETWEEN p_period_start AND p_period_end
  LOOP
    IF r.currency = v_display_currency THEN
      v_amount_display := r.amount;
    ELSE
      v_rate_from := NULLIF((v_effective_rates ->> r.currency), '')::numeric;
      v_rate_to := NULLIF((v_effective_rates ->> v_display_currency), '')::numeric;
      IF r.currency = 'EUR' THEN v_rate_from := 1; END IF;
      IF v_display_currency = 'EUR' THEN v_rate_to := 1; END IF;
      IF v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_from = 0 THEN
        v_amount_display := r.amount;
      ELSE
        v_amount_display := (r.amount / v_rate_from) * v_rate_to;
      END IF;
    END IF;

    v_settled_out := v_settled_out || jsonb_build_array(jsonb_build_object(
      'ledger_id', r.id, 'from_user', r.from_user, 'to_user', r.to_user,
      'amount', round(v_amount_display,2), 'currency', v_display_currency,
      'marked_at', r.marked_at
    ));
  END LOOP;

  -- Reapply nets after settled correction
  DECLARE
    v_new_members jsonb := '[]'::jsonb;
    v_adj jsonb := '{}'::jsonb;
  BEGIN
    FOREACH m_uid IN ARRAY v_members LOOP
      v_adj := jsonb_set(v_adj, ARRAY[m_uid::text], '0'::jsonb);
    END LOOP;
    FOR r IN SELECT (x->>'from_user')::uuid AS f, (x->>'to_user')::uuid AS t,
                    (x->>'amount')::numeric AS a
             FROM jsonb_array_elements(v_settled_out) x
    LOOP
      IF r.f = ANY(v_members) THEN
        v_adj := jsonb_set(v_adj, ARRAY[r.f::text],
          to_jsonb(((v_adj ->> r.f::text)::numeric) + r.a));
      END IF;
      IF r.t = ANY(v_members) THEN
        v_adj := jsonb_set(v_adj, ARRAY[r.t::text],
          to_jsonb(((v_adj ->> r.t::text)::numeric) - r.a));
      END IF;
    END LOOP;

    FOR r IN SELECT (x->>'user_id')::uuid AS uid,
                    (x->>'paid')::numeric AS paid,
                    (x->>'owed')::numeric AS owed,
                    (x->>'net')::numeric AS net
             FROM jsonb_array_elements(v_members_out) x
    LOOP
      v_net := round(r.net + COALESCE((v_adj->>r.uid::text)::numeric,0), 2);
      v_new_members := v_new_members || jsonb_build_array(jsonb_build_object(
        'user_id', r.uid, 'paid', r.paid, 'owed', r.owed, 'net', v_net
      ));

      IF v_net < -v_epsilon THEN
        v_debtors := v_debtors || jsonb_build_array(jsonb_build_object('user_id', r.uid, 'amount', -v_net));
      ELSIF v_net > v_epsilon THEN
        v_creditors := v_creditors || jsonb_build_array(jsonb_build_object('user_id', r.uid, 'amount', v_net));
      END IF;
    END LOOP;

    v_members_out := v_new_members;
  END;

  -- Greedy netting
  DECLARE
    d_idx int := 0; c_idx int := 0;
    d_len int; c_len int;
    d_amt numeric; c_amt numeric;
    d_uid uuid; c_uid uuid;
    transfer_amt numeric;
    tmp jsonb;
  BEGIN
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
          'from_user', d_uid, 'to_user', c_uid,
          'amount', transfer_amt, 'currency', v_display_currency));
      END IF;

      IF d_amt - transfer_amt <= v_epsilon THEN d_idx := d_idx + 1;
      ELSE v_debtors := jsonb_set(v_debtors, ARRAY[d_idx::text,'amount'], to_jsonb(d_amt - transfer_amt)); END IF;

      IF c_amt - transfer_amt <= v_epsilon THEN c_idx := c_idx + 1;
      ELSE v_creditors := jsonb_set(v_creditors, ARRAY[c_idx::text,'amount'], to_jsonb(c_amt - transfer_amt)); END IF;
    END LOOP;
  END;

  RETURN jsonb_build_object(
    'krug_id', p_krug_id,
    'period_start', p_period_start, 'period_end', p_period_end,
    'display_currency', v_display_currency, 'split_mode', v_split_mode,
    'members', v_members_out, 'transfers', v_transfers_out,
    'settled_transfers', v_settled_out,
    'fx', jsonb_build_object(
      'rates_used', v_rates_used,
      'snapshot_date', current_date,
      'source', v_fx_source,
      'frozen', v_fx_frozen,
      'frozen_at', v_snapshot_frozen_at
    ),
    'flags', jsonb_build_object(
      'missing_income_data', v_missing_income,
      'manual_mode_fallback_equal', v_manual_fallback,
      'mixed_currencies', v_mixed_currencies,
      'has_overrides', v_has_overrides
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) TO authenticated, service_role;
