
-- =========================================================
-- KRUG FAZA B — settlement ledger + override governance
-- =========================================================

-- Enum za override status
DO $$ BEGIN
  CREATE TYPE public.krug_override_status AS ENUM ('pending','potvrdjena','povucena','odbijena');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- 1. krug_settlement_ledger
-- ---------------------------------------------------------
CREATE TABLE public.krug_settlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  note text,
  marked_by uuid NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_from_not_to CHECK (from_user <> to_user),
  CONSTRAINT ledger_void_pair CHECK (
    (voided_at IS NULL AND voided_by IS NULL) OR
    (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
  )
);
CREATE INDEX idx_ledger_krug_active ON public.krug_settlement_ledger(krug_id, marked_at DESC) WHERE voided_at IS NULL;
CREATE INDEX idx_ledger_krug ON public.krug_settlement_ledger(krug_id);

GRANT SELECT ON public.krug_settlement_ledger TO authenticated;
GRANT ALL ON public.krug_settlement_ledger TO service_role;
ALTER TABLE public.krug_settlement_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_select_full_member ON public.krug_settlement_ledger
  FOR SELECT TO authenticated
  USING (public.krug_is_full_member(krug_id, auth.uid()));

CREATE TRIGGER krug_ledger_updated_at BEFORE UPDATE ON public.krug_settlement_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 2. krug_expense_split_override
-- ---------------------------------------------------------
CREATE TABLE public.krug_expense_split_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL,
  status public.krug_override_status NOT NULL DEFAULT 'pending',
  activated_at timestamptz,
  superseded_by uuid REFERENCES public.krug_expense_split_override(id) ON DELETE SET NULL,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- max 1 pending per trošak
CREATE UNIQUE INDEX ux_override_one_pending ON public.krug_expense_split_override(expense_id)
  WHERE status = 'pending';
-- max 1 aktivan per trošak
CREATE UNIQUE INDEX ux_override_one_active ON public.krug_expense_split_override(expense_id)
  WHERE status = 'potvrdjena';
CREATE INDEX idx_override_krug ON public.krug_expense_split_override(krug_id);
CREATE INDEX idx_override_expense ON public.krug_expense_split_override(expense_id);

GRANT SELECT ON public.krug_expense_split_override TO authenticated;
GRANT ALL ON public.krug_expense_split_override TO service_role;
ALTER TABLE public.krug_expense_split_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY override_select_full_member ON public.krug_expense_split_override
  FOR SELECT TO authenticated
  USING (public.krug_is_full_member(krug_id, auth.uid()));

CREATE TRIGGER krug_override_updated_at BEFORE UPDATE ON public.krug_expense_split_override
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 3. krug_expense_split_share
-- ---------------------------------------------------------
CREATE TABLE public.krug_expense_split_share (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid NOT NULL REFERENCES public.krug_expense_split_override(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  share_percent numeric NOT NULL CHECK (share_percent >= 0 AND share_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (override_id, user_id)
);
CREATE INDEX idx_share_override ON public.krug_expense_split_share(override_id);

GRANT SELECT ON public.krug_expense_split_share TO authenticated;
GRANT ALL ON public.krug_expense_split_share TO service_role;
ALTER TABLE public.krug_expense_split_share ENABLE ROW LEVEL SECURITY;

CREATE POLICY share_select_full_member ON public.krug_expense_split_share
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.krug_expense_split_override o
    WHERE o.id = krug_expense_split_share.override_id AND public.krug_is_full_member(o.krug_id, auth.uid())
  ));

-- ---------------------------------------------------------
-- 4. krug_expense_split_confirmation
-- ---------------------------------------------------------
CREATE TABLE public.krug_expense_split_confirmation (
  override_id uuid NOT NULL REFERENCES public.krug_expense_split_override(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (override_id, user_id)
);
CREATE INDEX idx_confirm_override ON public.krug_expense_split_confirmation(override_id);

GRANT SELECT ON public.krug_expense_split_confirmation TO authenticated;
GRANT ALL ON public.krug_expense_split_confirmation TO service_role;
ALTER TABLE public.krug_expense_split_confirmation ENABLE ROW LEVEL SECURITY;

CREATE POLICY confirm_select_full_member ON public.krug_expense_split_confirmation
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.krug_expense_split_override o
    WHERE o.id = krug_expense_split_confirmation.override_id AND public.krug_is_full_member(o.krug_id, auth.uid())
  ));

-- =========================================================
-- 5. RPC: krug_mark_settled
-- =========================================================
CREATE OR REPLACE FUNCTION public.krug_mark_settled(
  p_krug_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount numeric,
  p_currency text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lock_a bigint;
  v_lock_b bigint;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.krug_is_full_member(p_krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF p_from_user = p_to_user THEN
    RAISE EXCEPTION 'from_equals_to' USING ERRCODE = '22023';
  END IF;
  IF NOT public.krug_is_full_member(p_krug_id, p_from_user) OR
     NOT public.krug_is_full_member(p_krug_id, p_to_user) THEN
    RAISE EXCEPTION 'party_not_full_member' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR length(p_currency) = 0 THEN
    RAISE EXCEPTION 'invalid_currency' USING ERRCODE = '22023';
  END IF;

  -- Advisory lock po paru (kanonski: min,max) da spriječi konkurentni double-settle
  v_lock_a := hashtextextended(p_krug_id::text || ':' || LEAST(p_from_user, p_to_user)::text, 0);
  v_lock_b := hashtextextended(p_krug_id::text || ':' || GREATEST(p_from_user, p_to_user)::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_a, v_lock_b);

  INSERT INTO public.krug_settlement_ledger(
    krug_id, from_user, to_user, amount, currency, note, marked_by
  ) VALUES (
    p_krug_id, p_from_user, p_to_user, p_amount, upper(p_currency), NULLIF(p_note,''), v_uid
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.krug_mark_settled(uuid,uuid,uuid,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_mark_settled(uuid,uuid,uuid,numeric,text,text) TO authenticated;

-- =========================================================
-- 6. RPC: krug_void_settlement
-- =========================================================
CREATE OR REPLACE FUNCTION public.krug_void_settlement(
  p_ledger_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_settlement_ledger%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.krug_settlement_ledger
   WHERE id = p_ledger_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided' USING ERRCODE = '22023';
  END IF;

  UPDATE public.krug_settlement_ledger
     SET voided_at = now(), voided_by = v_uid, void_reason = trim(p_reason), updated_at = now()
   WHERE id = p_ledger_id;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.krug_void_settlement(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_void_settlement(uuid,text) TO authenticated;

-- =========================================================
-- 7. RPC: krug_override_propose
-- p_shares: [{"user_id":"uuid","share_percent":number}, ...]
-- =========================================================
CREATE OR REPLACE FUNCTION public.krug_override_propose(
  p_expense_id uuid,
  p_shares jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_krug_id uuid;
  v_full_members uuid[];
  v_expected_users uuid[];
  v_provided_users uuid[];
  v_sum numeric;
  v_id uuid;
  v_full_count int;
  r jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT e.krug_id INTO v_krug_id FROM public.expenses e
   WHERE e.id = p_expense_id AND e.deleted_at IS NULL
     AND e.krug_privacy = 'shared'::public.krug_privacy
     AND e.type = 'expense';
  IF v_krug_id IS NULL THEN
    RAISE EXCEPTION 'expense_not_eligible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.krug_is_full_member(v_krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;

  -- Skupi punopravne članove (owner + membership.punopravni)
  SELECT array_agg(DISTINCT uid ORDER BY uid) INTO v_full_members
  FROM (
    SELECT user_id AS uid FROM public.krug_ownership WHERE krug_id = v_krug_id
    UNION
    SELECT user_id AS uid FROM public.krug_membership
     WHERE krug_id = v_krug_id AND role = 'punopravni'::public.krug_membership_role
  ) s;
  v_full_count := COALESCE(array_length(v_full_members,1),0);

  -- Validacija shares: svi punopravni članovi + suma 100 ± 0.01
  IF jsonb_typeof(p_shares) <> 'array' THEN
    RAISE EXCEPTION 'shares_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT (x->>'user_id')::uuid ORDER BY (x->>'user_id')::uuid),
         COALESCE(sum((x->>'share_percent')::numeric), 0)
    INTO v_provided_users, v_sum
    FROM jsonb_array_elements(p_shares) x;

  IF v_provided_users IS NULL OR array_length(v_provided_users,1) <> v_full_count THEN
    RAISE EXCEPTION 'shares_must_cover_all_full_members' USING ERRCODE = '22023';
  END IF;
  -- moraju biti isti skup
  IF NOT (v_provided_users @> v_full_members AND v_full_members @> v_provided_users) THEN
    RAISE EXCEPTION 'shares_users_mismatch' USING ERRCODE = '22023';
  END IF;
  IF abs(v_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'shares_sum_not_100' USING ERRCODE = '22023';
  END IF;

  -- Supersede pending (ako postoji, prebaci u 'povucena')
  UPDATE public.krug_expense_split_override
     SET status = 'povucena', updated_at = now()
   WHERE expense_id = p_expense_id AND status = 'pending';

  INSERT INTO public.krug_expense_split_override(expense_id, krug_id, proposed_by, status)
  VALUES (p_expense_id, v_krug_id, v_uid, 'pending')
  RETURNING id INTO v_id;

  -- Shares
  FOR r IN SELECT * FROM jsonb_array_elements(p_shares) LOOP
    INSERT INTO public.krug_expense_split_share(override_id, user_id, share_percent)
    VALUES (v_id, (r->>'user_id')::uuid, (r->>'share_percent')::numeric);
  END LOOP;

  -- Auto-confirm predlagatelja
  INSERT INTO public.krug_expense_split_confirmation(override_id, user_id)
  VALUES (v_id, v_uid);

  -- Solo krug → odmah 'potvrdjena' + deaktiviraj eventualnog starog aktivnog
  IF v_full_count = 1 THEN
    UPDATE public.krug_expense_split_override
       SET status = 'povucena', updated_at = now()
     WHERE expense_id = p_expense_id AND status = 'potvrdjena' AND id <> v_id;

    UPDATE public.krug_expense_split_override
       SET status = 'potvrdjena', activated_at = now(), updated_at = now()
     WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id,
    'auto_activated', v_full_count = 1,
    'awaiting_confirmations', GREATEST(v_full_count - 1, 0));
END $$;

REVOKE ALL ON FUNCTION public.krug_override_propose(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_override_propose(uuid,jsonb) TO authenticated;

-- =========================================================
-- 8. RPC: krug_override_confirm
-- =========================================================
CREATE OR REPLACE FUNCTION public.krug_override_confirm(
  p_override_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_expense_split_override%ROWTYPE;
  v_full_count int;
  v_confirm_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_row FROM public.krug_expense_split_override
   WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.krug_expense_split_confirmation(override_id, user_id)
  VALUES (p_override_id, v_uid)
  ON CONFLICT DO NOTHING;

  -- Broj punopravnih članova
  SELECT count(*) INTO v_full_count FROM (
    SELECT user_id FROM public.krug_ownership WHERE krug_id = v_row.krug_id
    UNION
    SELECT user_id FROM public.krug_membership
     WHERE krug_id = v_row.krug_id AND role = 'punopravni'::public.krug_membership_role
  ) s;

  SELECT count(*) INTO v_confirm_count FROM public.krug_expense_split_confirmation
   WHERE override_id = p_override_id;

  IF v_confirm_count >= v_full_count THEN
    -- Deaktiviraj starog aktivnog za isti expense
    UPDATE public.krug_expense_split_override
       SET status = 'povucena', updated_at = now()
     WHERE expense_id = v_row.expense_id AND status = 'potvrdjena' AND id <> p_override_id;

    UPDATE public.krug_expense_split_override
       SET status = 'potvrdjena', activated_at = now(), updated_at = now()
     WHERE id = p_override_id;

    RETURN jsonb_build_object('ok', true, 'activated', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'activated', false,
    'awaiting_confirmations', v_full_count - v_confirm_count);
END $$;

REVOKE ALL ON FUNCTION public.krug_override_confirm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_override_confirm(uuid) TO authenticated;

-- =========================================================
-- 9. RPC: krug_override_reject
-- =========================================================
CREATE OR REPLACE FUNCTION public.krug_override_reject(
  p_override_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_expense_split_override%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_row FROM public.krug_expense_split_override
   WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023';
  END IF;
  IF v_row.proposed_by = v_uid THEN
    RAISE EXCEPTION 'proposer_cannot_reject' USING ERRCODE = '42501';
  END IF;

  UPDATE public.krug_expense_split_override
     SET status = 'odbijena', reject_reason = NULLIF(trim(coalesce(p_reason,'')),''), updated_at = now()
   WHERE id = p_override_id;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.krug_override_reject(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_override_reject(uuid,text) TO authenticated;

-- =========================================================
-- 10. RPC: krug_override_withdraw
-- =========================================================
CREATE OR REPLACE FUNCTION public.krug_override_withdraw(
  p_override_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_expense_split_override%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_row FROM public.krug_expense_split_override
   WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.proposed_by <> v_uid THEN
    RAISE EXCEPTION 'only_proposer_can_withdraw' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.krug_expense_split_override
     SET status = 'povucena', updated_at = now()
   WHERE id = p_override_id;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.krug_override_withdraw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_override_withdraw(uuid) TO authenticated;

-- =========================================================
-- 11. krug_settlement_preview — kreće od žive definicije,
--     dodaje override + settled korekciju.
-- =========================================================
CREATE OR REPLACE FUNCTION public.krug_settlement_preview(
  p_krug_id uuid,
  p_period_start date,
  p_period_end date,
  p_display_currency text DEFAULT NULL::text,
  p_fx_rates jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
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
  v_override_shares jsonb;
  v_share_pct numeric;
BEGIN
  IF NOT public.krug_is_full_member(p_krug_id, auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
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
      'fx', jsonb_build_object('rates_used','{}'::jsonb,'snapshot_date',current_date,'source','client'),
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
           COALESCE(e.currency,'EUR') AS currency, e.amount
    FROM public.expenses e
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
      v_rate_from := NULLIF((p_fx_rates ->> r.currency), '')::numeric;
      v_rate_to := NULLIF((p_fx_rates ->> v_display_currency), '')::numeric;
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

    -- Override lookup
    SELECT o.id INTO v_override_id FROM public.krug_expense_split_override o
     WHERE o.expense_id = r.expense_id AND o.status = 'potvrdjena' LIMIT 1;

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
      v_rate_from := NULLIF((p_fx_rates ->> r.currency), '')::numeric;
      v_rate_to := NULLIF((p_fx_rates ->> v_display_currency), '')::numeric;
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

    -- Korekcija netova iz members_out
    -- Rebuildaj v_members_out s ažuriranim netovima
    -- (jednostavniji pristup: nakon petlje, prewalkaj settled i primijeni)
  END LOOP;

  -- Reapply nets after settled correction
  DECLARE
    v_new_members jsonb := '[]'::jsonb;
    v_adj jsonb := '{}'::jsonb;
    v_amt numeric;
    v_from uuid;
    v_to uuid;
  BEGIN
    FOREACH m_uid IN ARRAY v_members LOOP
      v_adj := jsonb_set(v_adj, ARRAY[m_uid::text], '0'::jsonb);
    END LOOP;
    FOR r IN SELECT * FROM jsonb_array_elements(v_settled_out) x LOOP
      v_from := ((r->'value'))::text::uuid; -- placeholder
    END LOOP;
    -- Proper iteration
    v_adj := '{}'::jsonb;
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
    'fx', jsonb_build_object('rates_used', v_rates_used, 'snapshot_date', current_date, 'source', 'client'),
    'flags', jsonb_build_object(
      'missing_income_data', v_missing_income,
      'manual_mode_fallback_equal', v_manual_fallback,
      'mixed_currencies', v_mixed_currencies,
      'has_overrides', v_has_overrides
    )
  );
END;
$function$;

-- Preview već je REVOKE/GRANT postavljen u prethodnim migracijama, ali osiguraj:
REVOKE ALL ON FUNCTION public.krug_settlement_preview(uuid,date,date,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_settlement_preview(uuid,date,date,text,jsonb) TO authenticated;
