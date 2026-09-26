-- Krug „tko kome" za običnog člana, nalog 3: obični član sudjeluje samo kad ga
-- prijedlog izričito uključi. Sve funkcije od žive definicije; potpisi i prava isti.

-- Stranka prijedloga: trenutni član Kruga koji ima udio u tom prijedlogu.
CREATE OR REPLACE FUNCTION public.krug_override_party(p_override_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.krug_expense_split_override o
      JOIN public.krug_expense_split_share s ON s.override_id = o.id
     WHERE o.id = p_override_id
       AND s.user_id = p_user
       AND public.krug_is_member(o.krug_id, p_user)
  );
$function$;
REVOKE ALL ON FUNCTION public.krug_override_party(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_override_party(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_override_party(uuid, uuid) TO authenticated, service_role;

CREATE POLICY override_select_own_share ON public.krug_expense_split_override
  FOR SELECT TO authenticated
  USING (public.krug_override_party(id, auth.uid()));
CREATE POLICY share_select_own_share ON public.krug_expense_split_share
  FOR SELECT TO authenticated
  USING (public.krug_override_party(override_id, auth.uid()));
CREATE POLICY confirm_select_own_share ON public.krug_expense_split_confirmation
  FOR SELECT TO authenticated
  USING (public.krug_override_party(override_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.krug_override_propose(p_expense_id uuid, p_shares jsonb, p_shared_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_krug_id uuid;
  v_full_members uuid[];
  v_expected_users uuid[];
  v_provided_users uuid[];
  v_sum numeric;
  v_id uuid;
  v_full_count int;
  v_recipients uuid[];
  r jsonb;
  v_expense_amount numeric;
  v_expense_currency text;
  v_vars jsonb;
  v_extra uuid[];
  v_required_count int;
  x_uid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT e.krug_id, e.amount, COALESCE(e.currency,'EUR') INTO v_krug_id, v_expense_amount, v_expense_currency FROM public.expenses e
   WHERE e.id = p_expense_id AND e.deleted_at IS NULL
     AND e.krug_privacy = 'shared'::public.krug_privacy
     AND e.type = 'expense';
  IF v_krug_id IS NULL THEN
    RAISE EXCEPTION 'expense_not_eligible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.krug_is_full_member(v_krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;

  -- "Dijeli samo X": NULL = cijeli iznos. Svota u valuti troška.
  IF p_shared_amount IS NOT NULL THEN
    IF p_shared_amount <= 0 THEN
      RAISE EXCEPTION 'shared_amount_invalid' USING ERRCODE = '22023';
    END IF;
    IF p_shared_amount > abs(v_expense_amount) THEN
      RAISE EXCEPTION 'shared_amount_exceeds_amount' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT array_agg(DISTINCT uid ORDER BY uid) INTO v_full_members
  FROM (
    SELECT user_id AS uid FROM public.krug_ownership WHERE krug_id = v_krug_id
    UNION
    SELECT user_id AS uid FROM public.krug_membership
     WHERE krug_id = v_krug_id AND role = 'punopravni'::public.krug_membership_role
  ) s;
  v_full_count := COALESCE(array_length(v_full_members,1),0);

  IF jsonb_typeof(p_shares) <> 'array' THEN
    RAISE EXCEPTION 'shares_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT (x->>'user_id')::uuid ORDER BY (x->>'user_id')::uuid),
         COALESCE(sum((x->>'share_percent')::numeric), 0)
    INTO v_provided_users, v_sum
    FROM jsonb_array_elements(p_shares) x;

  -- Svi punopravni moraju biti pokriveni; dodatno smiju biti samo trenutni članovi.
  IF v_provided_users IS NULL OR array_length(v_provided_users,1) < v_full_count THEN
    RAISE EXCEPTION 'shares_must_cover_all_full_members' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_provided_users @> v_full_members) THEN
    RAISE EXCEPTION 'shares_users_mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(u ORDER BY u) INTO v_extra
    FROM unnest(v_provided_users) u WHERE u <> ALL (v_full_members);
  IF v_extra IS NOT NULL THEN
    FOREACH x_uid IN ARRAY v_extra LOOP
      IF NOT public.krug_is_member(v_krug_id, x_uid) THEN
        RAISE EXCEPTION 'shares_user_not_member' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_shares)) <> array_length(v_provided_users,1) THEN
    RAISE EXCEPTION 'shares_invalid' USING ERRCODE = '22023';
  END IF;
  IF abs(v_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'shares_sum_not_100' USING ERRCODE = '22023';
  END IF;
  v_required_count := v_full_count + COALESCE(array_length(v_extra,1),0);

  UPDATE public.krug_expense_split_override
     SET status = 'povucena', updated_at = now()
   WHERE expense_id = p_expense_id AND status = 'pending';

  INSERT INTO public.krug_expense_split_override(expense_id, krug_id, proposed_by, status, shared_amount)
  VALUES (p_expense_id, v_krug_id, v_uid, 'pending', p_shared_amount)
  RETURNING id INTO v_id;

  FOR r IN SELECT * FROM jsonb_array_elements(p_shares) LOOP
    INSERT INTO public.krug_expense_split_share(override_id, user_id, share_percent)
    VALUES (v_id, (r->>'user_id')::uuid, (r->>'share_percent')::numeric);
  END LOOP;

  INSERT INTO public.krug_expense_split_confirmation(override_id, user_id)
  VALUES (v_id, v_uid);

  IF v_required_count = 1 THEN
    UPDATE public.krug_expense_split_override
       SET status = 'povucena', updated_at = now()
     WHERE expense_id = p_expense_id AND status = 'potvrdjena' AND id <> v_id;

    UPDATE public.krug_expense_split_override
       SET status = 'potvrdjena', activated_at = now(), updated_at = now()
     WHERE id = v_id;
  ELSE
    -- Additive best-effort: obavijest NE smije srušiti prijedlog.
    BEGIN
      IF p_shared_amount IS NOT NULL THEN
        v_vars := jsonb_build_object(
          'shared_amount', to_char(p_shared_amount, 'FM999999999990.00'),
          'amount', to_char(abs(v_expense_amount), 'FM999999999990.00'),
          'currency', v_expense_currency);
      END IF;
      SELECT array_agg(u) INTO v_recipients
        FROM unnest(v_full_members || COALESCE(v_extra, ARRAY[]::uuid[])) u WHERE u <> v_uid;
      IF v_recipients IS NOT NULL AND array_length(v_recipients,1) > 0 THEN
        PERFORM public.krug_emit_notification(
          p_event_type := 'krug_override_proposed',
          p_krug_id := v_krug_id,
          p_actor_id := v_uid,
          p_expense_id := p_expense_id,
          p_dedup_ref := 'override_proposed:'||v_id::text,
          p_recipient_override := v_recipients,
          p_vars := v_vars
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'krug_override_propose: notify failed (id=%): %', v_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id,
    'auto_activated', v_required_count = 1,
    'awaiting_confirmations', GREATEST(v_required_count - 1, 0));
END $function$;
REVOKE ALL ON FUNCTION public.krug_override_propose(uuid, jsonb, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_override_propose(uuid, jsonb, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_override_propose(uuid, jsonb, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.krug_override_confirm(p_override_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Punopravni član ili obični član koji ima udio u ovom prijedlogu.
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid)
     AND NOT public.krug_override_party(p_override_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.krug_expense_split_confirmation(override_id, user_id)
  VALUES (p_override_id, v_uid)
  ON CONFLICT DO NOTHING;

  -- Potrebne potvrde: svi punopravni + svaki ne-punopravni s udjelom.
  WITH req AS (
    SELECT user_id FROM public.krug_ownership WHERE krug_id = v_row.krug_id
    UNION
    SELECT user_id FROM public.krug_membership
     WHERE krug_id = v_row.krug_id AND role = 'punopravni'::public.krug_membership_role
    UNION
    SELECT user_id FROM public.krug_expense_split_share WHERE override_id = p_override_id
  )
  SELECT (SELECT count(*) FROM req),
         (SELECT count(*) FROM public.krug_expense_split_confirmation c
           WHERE c.override_id = p_override_id AND c.user_id IN (SELECT user_id FROM req))
    INTO v_full_count, v_confirm_count;

  IF v_confirm_count >= v_full_count THEN
    UPDATE public.krug_expense_split_override
       SET status = 'povucena', updated_at = now()
     WHERE expense_id = v_row.expense_id AND status = 'potvrdjena' AND id <> p_override_id;

    UPDATE public.krug_expense_split_override
       SET status = 'potvrdjena', activated_at = now(), updated_at = now()
     WHERE id = p_override_id;

    BEGIN
      IF v_row.proposed_by IS NOT NULL AND v_row.proposed_by <> v_uid THEN
        PERFORM public.krug_emit_notification(
          p_event_type := 'krug_override_confirmed',
          p_krug_id := v_row.krug_id,
          p_actor_id := v_uid,
          p_expense_id := v_row.expense_id,
          p_dedup_ref := 'override_confirmed:'||p_override_id::text,
          p_recipient_override := ARRAY[v_row.proposed_by]
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'krug_override_confirm: notify failed (id=%): %', p_override_id, SQLERRM;
    END;

    RETURN jsonb_build_object('ok', true, 'activated', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'activated', false,
    'awaiting_confirmations', v_full_count - v_confirm_count);
END $function$;
REVOKE ALL ON FUNCTION public.krug_override_confirm(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_override_confirm(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_override_confirm(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.krug_override_reject(p_override_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_expense_split_override%ROWTYPE;
  v_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_row FROM public.krug_expense_split_override
   WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid)
     AND NOT public.krug_override_party(p_override_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023';
  END IF;
  IF v_row.proposed_by = v_uid THEN
    RAISE EXCEPTION 'proposer_cannot_reject' USING ERRCODE = '42501';
  END IF;

  v_reason := NULLIF(trim(coalesce(p_reason,'')),'');

  UPDATE public.krug_expense_split_override
     SET status = 'odbijena', reject_reason = v_reason, updated_at = now()
   WHERE id = p_override_id;

  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_override_rejected',
      p_krug_id := v_row.krug_id,
      p_actor_id := v_uid,
      p_expense_id := v_row.expense_id,
      p_dedup_ref := 'override_rejected:'||p_override_id::text,
      p_recipient_override := ARRAY[v_row.proposed_by],
      p_vars := jsonb_build_object('reason', COALESCE(v_reason, '—'))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_override_reject: notify failed (id=%): %', p_override_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true);
END $function$;
REVOKE ALL ON FUNCTION public.krug_override_reject(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_override_reject(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_override_reject(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.krug_mark_settled_with_source(p_krug_id uuid, p_from_user uuid, p_to_user uuid, p_amount numeric, p_currency text, p_payer_source_id uuid, p_client_request_id uuid, p_payer_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock bigint;
  v_existing public.krug_settlement_ledger%ROWTYPE;
  v_src public.custom_payment_sources%ROWTYPE;
  v_currency text;
  v_src_currency text;
  v_payer_amount numeric;
  v_expense_id uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.krug_settlement_ledger
   WHERE marked_by = v_uid AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id,
      'payer_expense_id', v_existing.payer_expense_id, 'idempotent', true);
  END IF;

  IF NOT public.krug_is_member(p_krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_member' USING ERRCODE = '42501';
  END IF;
  IF p_from_user = p_to_user THEN
    RAISE EXCEPTION 'from_equals_to' USING ERRCODE = '22023';
  END IF;
  IF v_uid <> p_from_user THEN
    RAISE EXCEPTION 'only_debtor_can_settle' USING ERRCODE = '42501';
  END IF;
  IF NOT public.krug_is_member(p_krug_id, p_from_user) OR
     NOT public.krug_is_member(p_krug_id, p_to_user) THEN
    RAISE EXCEPTION 'party_not_member' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR length(trim(p_currency)) = 0 THEN
    RAISE EXCEPTION 'invalid_currency' USING ERRCODE = '22023';
  END IF;
  v_currency := upper(trim(p_currency));

  IF p_payer_source_id IS NULL THEN
    RAISE EXCEPTION 'source_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_src FROM public.custom_payment_sources WHERE id = p_payer_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_write_payment_source(p_payer_source_id, v_uid) THEN
    RAISE EXCEPTION 'source_not_writable' USING ERRCODE = '42501';
  END IF;

  v_src_currency := upper(COALESCE(NULLIF(trim(v_src.currency), ''), 'EUR'));
  IF v_src_currency = v_currency THEN
    IF p_payer_amount IS NOT NULL AND p_payer_amount <> p_amount THEN
      RAISE EXCEPTION 'payer_amount_mismatch' USING ERRCODE = '22023';
    END IF;
    v_payer_amount := p_amount;
  ELSE
    IF p_payer_amount IS NULL OR p_payer_amount <= 0 THEN
      RAISE EXCEPTION 'payer_amount_required' USING ERRCODE = '22023';
    END IF;
    v_payer_amount := p_payer_amount;
  END IF;

  v_lock := hashtextextended(
    p_krug_id::text || ':' ||
    LEAST(p_from_user, p_to_user)::text || ':' ||
    GREATEST(p_from_user, p_to_user)::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock);

  SELECT * INTO v_existing FROM public.krug_settlement_ledger
   WHERE marked_by = v_uid AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id,
      'payer_expense_id', v_existing.payer_expense_id, 'idempotent', true);
  END IF;

  INSERT INTO public.expenses (
    user_id, type, amount, payment_source, currency, description,
    expense_nature, status, submitted_by, client_request_id
  ) VALUES (
    v_uid, 'expense', v_payer_amount, 'custom:' || p_payer_source_id::text, v_src_currency,
    public.krug_settlement_description(v_uid, p_to_user),
    'krug_settlement', 'approved', v_uid, p_client_request_id
  ) RETURNING id INTO v_expense_id;

  INSERT INTO public.krug_settlement_ledger(
    krug_id, from_user, to_user, amount, currency, note, marked_by,
    payer_expense_id, payer_source_id, client_request_id, payer_amount, payer_currency
  ) VALUES (
    p_krug_id, p_from_user, p_to_user, p_amount, v_currency, NULLIF(p_note,''), v_uid,
    v_expense_id, p_payer_source_id, p_client_request_id, v_payer_amount, v_src_currency
  ) RETURNING id INTO v_id;

  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_settlement_marked_settled',
      p_krug_id := p_krug_id,
      p_actor_id := v_uid,
      p_dedup_ref := 'settled:'||v_id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_mark_settled_with_source: notify failed (id=%): %', v_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id,
    'payer_expense_id', v_expense_id, 'idempotent', false);
END $function$;
REVOKE ALL ON FUNCTION public.krug_mark_settled_with_source(uuid, uuid, uuid, numeric, text, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_mark_settled_with_source(uuid, uuid, uuid, numeric, text, uuid, uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_mark_settled_with_source(uuid, uuid, uuid, numeric, text, uuid, uuid, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.krug_confirm_settlement_receipt(p_ledger_id uuid, p_recipient_source_id uuid, p_client_request_id uuid, p_recipient_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_settlement_ledger%ROWTYPE;
  v_src public.custom_payment_sources%ROWTYPE;
  v_src_currency text;
  v_amount numeric;
  v_expense_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.krug_settlement_ledger
   WHERE id = p_ledger_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_uid <> v_row.to_user THEN
    RAISE EXCEPTION 'only_recipient_can_confirm' USING ERRCODE = '42501';
  END IF;
  -- Bivši član (ili član obrisanog Kruga) ne potvrđuje primitak.
  IF NOT public.krug_is_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided' USING ERRCODE = '22023';
  END IF;
  IF v_row.client_request_id IS NULL THEN
    RAISE EXCEPTION 'legacy_settlement' USING ERRCODE = '22023';
  END IF;

  IF v_row.recipient_confirmed_at IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.expenses
                WHERE id = v_row.recipient_expense_id
                  AND client_request_id = p_client_request_id) THEN
      RETURN jsonb_build_object('ok', true, 'id', v_row.id,
        'recipient_expense_id', v_row.recipient_expense_id, 'idempotent', true);
    END IF;
    RAISE EXCEPTION 'already_confirmed' USING ERRCODE = '22023';
  END IF;

  IF p_recipient_source_id IS NULL THEN
    RAISE EXCEPTION 'source_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_src FROM public.custom_payment_sources WHERE id = p_recipient_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_write_payment_source(p_recipient_source_id, v_uid) THEN
    RAISE EXCEPTION 'source_not_writable' USING ERRCODE = '42501';
  END IF;

  v_src_currency := upper(COALESCE(NULLIF(trim(v_src.currency), ''), 'EUR'));
  IF v_src_currency = upper(v_row.currency) THEN
    IF p_recipient_amount IS NOT NULL AND p_recipient_amount <> v_row.amount THEN
      RAISE EXCEPTION 'recipient_amount_mismatch' USING ERRCODE = '22023';
    END IF;
    v_amount := v_row.amount;
  ELSE
    IF p_recipient_amount IS NULL OR p_recipient_amount <= 0 THEN
      RAISE EXCEPTION 'recipient_amount_required' USING ERRCODE = '22023';
    END IF;
    v_amount := p_recipient_amount;
  END IF;

  INSERT INTO public.expenses (
    user_id, type, amount, payment_source, currency, description,
    expense_nature, status, submitted_by, client_request_id
  ) VALUES (
    v_uid, 'income', v_amount, 'custom:' || p_recipient_source_id::text, v_src_currency,
    public.krug_settlement_description(v_uid, v_row.from_user),
    'krug_settlement', 'approved', v_uid, p_client_request_id
  ) RETURNING id INTO v_expense_id;

  UPDATE public.krug_settlement_ledger
     SET recipient_expense_id = v_expense_id,
         recipient_source_id = p_recipient_source_id,
         recipient_confirmed_at = now(),
         updated_at = now()
   WHERE id = p_ledger_id;

  RETURN jsonb_build_object('ok', true, 'id', p_ledger_id,
    'recipient_expense_id', v_expense_id, 'idempotent', false);
END $function$;
REVOKE ALL ON FUNCTION public.krug_confirm_settlement_receipt(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_confirm_settlement_receipt(uuid, uuid, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_confirm_settlement_receipt(uuid, uuid, uuid, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.krug_void_settlement(p_ledger_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_settlement_ledger%ROWTYPE;
  v_reason text;
  v_exp record;
  v_deleted uuid[] := ARRAY[]::uuid[];
  v_kept uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  v_reason := trim(p_reason);

  SELECT * INTO v_row FROM public.krug_settlement_ledger
   WHERE id = p_ledger_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.krug_is_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_member' USING ERRCODE = '42501';
  END IF;
  -- Poništenje je zaštita obiju strana duga: dopušteno dužniku i vjerovniku.
  IF v_uid <> v_row.from_user AND v_uid <> v_row.to_user THEN
    RAISE EXCEPTION 'only_party_can_void' USING ERRCODE = '42501';
  END IF;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided' USING ERRCODE = '22023';
  END IF;

  UPDATE public.krug_settlement_ledger
     SET voided_at = now(), voided_by = v_uid, void_reason = v_reason, updated_at = now()
   WHERE id = p_ledger_id;

  -- Povezane transakcije: nespojene idu u koš (saldo se vraća kroz postojeći
  -- trigger). Spojena s bankovnim retkom ostaje (i dalje krug_settlement),
  -- samo se odvaja od poništenog zapisa — bankovni redak se ne gubi.
  FOR v_exp IN
    SELECT e.id, e.deleted_at, e.bank_transaction_id, e.bank_match_status
      FROM public.expenses e
     WHERE e.id IN (v_row.payer_expense_id, v_row.recipient_expense_id)
     FOR UPDATE
  LOOP
    IF v_exp.deleted_at IS NOT NULL THEN
      CONTINUE;
    END IF;
    IF v_exp.bank_transaction_id IS NOT NULL OR v_exp.bank_match_status = 'confirmed' THEN
      v_kept := v_kept || v_exp.id;
    ELSE
      UPDATE public.expenses SET deleted_at = now(), deleted_by = v_uid WHERE id = v_exp.id;
      v_deleted := v_deleted || v_exp.id;
    END IF;
  END LOOP;

  IF COALESCE(array_length(v_kept, 1), 0) > 0 THEN
    UPDATE public.krug_settlement_ledger
       SET payer_expense_id = CASE WHEN payer_expense_id = ANY (v_kept) THEN NULL ELSE payer_expense_id END,
           recipient_expense_id = CASE WHEN recipient_expense_id = ANY (v_kept) THEN NULL ELSE recipient_expense_id END
     WHERE id = p_ledger_id;
  END IF;

  -- Additive best-effort: obavijest o poništenju NE smije srušiti void.
  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_settlement_voided',
      p_krug_id := v_row.krug_id,
      p_actor_id := v_uid,
      p_dedup_ref := 'voided:'||p_ledger_id::text,
      p_vars := jsonb_build_object(
        'reason', v_reason,
        'amount', to_char(v_row.amount, 'FM999999990.00'),
        'currency', v_row.currency
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_void_settlement: notify failed (id=%): %', p_ledger_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true,
    'deleted_expense_ids', to_jsonb(v_deleted),
    'bank_linked_kept', COALESCE(array_length(v_kept, 1), 0) > 0,
    'bank_linked_kept_ids', to_jsonb(v_kept));
END $function$;
REVOKE ALL ON FUNCTION public.krug_void_settlement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_void_settlement(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_void_settlement(uuid, text) TO authenticated, service_role;

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
  -- Nalog 3: obični članovi uključeni potvrđenim prijedlogom (ili stranke podmirenja).
  v_extra uuid[];
  v_parties uuid[];
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

  SELECT array_agg(DISTINCT x.uid ORDER BY x.uid) INTO v_extra
  FROM (
    SELECT e.user_id AS uid
      FROM public.expenses e
      JOIN public.krug_expense_split_override o ON o.expense_id = e.id AND o.status = 'potvrdjena'
     WHERE e.krug_id = p_krug_id
       AND e.krug_privacy = 'shared'::public.krug_privacy
       AND e.krug_shared_status = 'potvrdjena'::public.krug_shared_status
       AND e.deleted_at IS NULL AND e.type = 'expense'
       AND e.date::date BETWEEN p_period_start AND p_period_end
    UNION
    SELECT sh.user_id
      FROM public.expenses e
      JOIN public.krug_expense_split_override o ON o.expense_id = e.id AND o.status = 'potvrdjena'
      JOIN public.krug_expense_split_share sh ON sh.override_id = o.id
     WHERE e.krug_id = p_krug_id
       AND e.krug_privacy = 'shared'::public.krug_privacy
       AND e.krug_shared_status = 'potvrdjena'::public.krug_shared_status
       AND e.deleted_at IS NULL AND e.type = 'expense'
       AND e.date::date BETWEEN p_period_start AND p_period_end
    UNION
    SELECT unnest(ARRAY[l.from_user, l.to_user])
      FROM public.krug_settlement_ledger l
     WHERE l.krug_id = p_krug_id AND l.voided_at IS NULL
       AND l.marked_at::date BETWEEN p_period_start AND p_period_end
  ) x
  WHERE x.uid <> ALL (v_members)
    AND EXISTS (SELECT 1 FROM public.krug_membership mm
                 WHERE mm.krug_id = p_krug_id AND mm.user_id = x.uid
                   AND mm.role = 'obicni'::public.krug_membership_role);
  v_parties := v_members || COALESCE(v_extra, ARRAY[]::uuid[]);

  FOREACH m_uid IN ARRAY v_parties LOOP
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

    IF r.payer = ANY(v_members) OR (r.override_id IS NOT NULL AND r.payer = ANY(v_parties)) THEN
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

  FOREACH m_uid IN ARRAY v_parties LOOP
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
    FOREACH m_uid IN ARRAY v_parties LOOP
      v_adj := jsonb_set(v_adj, ARRAY[m_uid::text], '0'::jsonb);
    END LOOP;
    FOR r IN SELECT (x->>'from_user')::uuid AS f, (x->>'to_user')::uuid AS t,
                    (x->>'amount')::numeric AS a
             FROM jsonb_array_elements(v_settled_out) x
    LOOP
      IF r.f = ANY(v_parties) THEN
        v_adj := jsonb_set(v_adj, ARRAY[r.f::text],
          to_jsonb(((v_adj ->> r.f::text)::numeric) + r.a));
      END IF;
      IF r.t = ANY(v_parties) THEN
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
