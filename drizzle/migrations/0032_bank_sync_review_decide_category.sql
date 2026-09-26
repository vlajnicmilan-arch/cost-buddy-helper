-- Novi redak iz reda dobiva kategoriju koju je klijent dobio istim putem kao
-- ručni upis (categorize-transaction → assignTreeCategory). Bez nje: 'other'.
-- Stari oblik (4 argumenta) se uklanja da ne ostanu dva.
DROP FUNCTION IF EXISTS public.bank_sync_review_decide(uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.bank_sync_review_decide(p_id uuid, p_decision text, p_target_id uuid DEFAULT NULL::uuid, p_counterpart_source_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.bank_sync_review_queue%ROWTYPE;
  v_p jsonb;
  v_wallet uuid;
  v_type text;
  v_expense_id uuid;
  v_pay_source text;
  v_income_source uuid;
  v_category text := COALESCE(NULLIF(btrim(left(p_category, 100)), ''), 'other');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('merge', 'new', 'transfer', 'dismiss') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.bank_sync_review_queue WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_row.user_id <> v_uid THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'status', 'already_decided',
      'decision', v_row.decision,
      'expense_id', v_row.decided_expense_id
    );
  END IF;

  v_p := v_row.payload;
  v_wallet := NULLIF(v_p->>'wallet_id', '')::uuid;
  v_type := v_p->>'type';

  IF p_decision = 'merge' THEN
    IF p_target_id IS NULL OR NOT (v_row.candidate_ids ? p_target_id::text) THEN
      RAISE EXCEPTION 'target_not_candidate' USING ERRCODE = '22023';
    END IF;
    UPDATE public.expenses
       SET bank_transaction_id = v_row.stable_id,
           bank_account_id = v_row.bank_account_id,
           date = (v_p->>'date')::timestamptz,
           bank_match_status = 'confirmed',
           bank_raw_line = v_p->>'bank_raw_line',
           bank_raw_line_source = 'enable_banking',
           payment_source_card_id = COALESCE(NULLIF(v_p->>'payment_source_card_id', '')::uuid, payment_source_card_id)
     WHERE id = p_target_id
       AND user_id = v_uid
       AND deleted_at IS NULL
       AND bank_transaction_id IS NULL
    RETURNING id INTO v_expense_id;
    IF v_expense_id IS NULL THEN
      RAISE EXCEPTION 'target_unavailable' USING ERRCODE = '22023';
    END IF;

  ELSIF p_decision = 'new' THEN
    INSERT INTO public.expenses (
      user_id, amount, description, category, type, date, payment_source,
      payment_source_card_id, currency, business_profile_id,
      bank_transaction_id, bank_account_id, bank_match_status,
      bank_raw_line, bank_raw_line_source
    ) VALUES (
      v_uid, (v_p->>'amount')::numeric, v_p->>'description', v_category, v_type,
      (v_p->>'date')::timestamptz, v_p->>'payment_source',
      NULLIF(v_p->>'payment_source_card_id', '')::uuid, COALESCE(v_p->>'currency', 'EUR'),
      NULLIF(v_p->>'business_profile_id', '')::uuid,
      v_row.stable_id, v_row.bank_account_id, 'bank_only',
      v_p->>'bank_raw_line', 'enable_banking'
    ) RETURNING id INTO v_expense_id;

  ELSIF p_decision = 'transfer' THEN
    IF p_counterpart_source_id IS NULL OR v_wallet IS NULL OR p_counterpart_source_id = v_wallet THEN
      RAISE EXCEPTION 'invalid_counterpart' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.custom_payment_sources
       WHERE id = p_counterpart_source_id AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'invalid_counterpart' USING ERRCODE = '22023';
    END IF;
    -- Isto pravilo kao buildTransferPair: odlazak s izvoda → izvod plaća.
    IF v_type = 'expense' THEN
      v_pay_source := 'custom:' || v_wallet::text;
      v_income_source := p_counterpart_source_id;
    ELSE
      v_pay_source := 'custom:' || p_counterpart_source_id::text;
      v_income_source := v_wallet;
    END IF;
    INSERT INTO public.expenses (
      user_id, amount, description, category, type, date, payment_source,
      income_source_id, payment_source_card_id, currency, business_profile_id,
      bank_transaction_id, bank_account_id, bank_match_status,
      bank_raw_line, bank_raw_line_source
    ) VALUES (
      v_uid, (v_p->>'amount')::numeric, v_p->>'description', 'other', 'transfer',
      (v_p->>'date')::timestamptz, v_pay_source, v_income_source,
      NULLIF(v_p->>'payment_source_card_id', '')::uuid, COALESCE(v_p->>'currency', 'EUR'),
      NULLIF(v_p->>'business_profile_id', '')::uuid,
      v_row.stable_id, v_row.bank_account_id, 'bank_only',
      v_p->>'bank_raw_line', 'enable_banking'
    ) RETURNING id INTO v_expense_id;
  END IF;

  UPDATE public.bank_sync_review_queue
     SET status = CASE WHEN p_decision = 'dismiss' THEN 'dismissed' ELSE 'decided' END,
         decision = p_decision,
         decided_expense_id = v_expense_id,
         decided_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('status', 'decided', 'decision', p_decision, 'expense_id', v_expense_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.bank_sync_review_decide(uuid, text, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bank_sync_review_decide(uuid, text, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.bank_sync_review_decide(uuid, text, uuid, uuid, text) TO authenticated, service_role;