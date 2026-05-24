
CREATE OR REPLACE FUNCTION public.merge_manual_with_bank(p_manual_id uuid, p_bank_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manual RECORD;
  v_bank RECORD;
  v_source_uuid uuid;
  v_max_amt numeric;
  v_day_diff int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_manual FROM public.expenses WHERE id = p_manual_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual_not_found'; END IF;
  IF v_manual.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'manual_deleted'; END IF;
  IF v_manual.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_manual.bank_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'manual_is_bank'; END IF;
  IF v_manual.bank_match_status = 'confirmed' THEN RAISE EXCEPTION 'already_confirmed'; END IF;

  SELECT * INTO v_bank FROM public.expenses WHERE id = p_bank_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_not_found'; END IF;
  IF v_bank.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'bank_deleted'; END IF;
  IF v_bank.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_bank.bank_transaction_id IS NULL THEN RAISE EXCEPTION 'bank_is_manual'; END IF;

  -- Defense in depth: re-verify all client-side rules
  IF v_manual.type IS DISTINCT FROM v_bank.type THEN RAISE EXCEPTION 'different_type'; END IF;
  IF v_manual.type = 'transfer' THEN RAISE EXCEPTION 'transfer_not_allowed'; END IF;
  IF COALESCE(v_manual.expense_nature,'') = 'correction'
     OR COALESCE(v_bank.expense_nature,'') = 'correction' THEN
    RAISE EXCEPTION 'correction_not_allowed';
  END IF;
  IF COALESCE(v_manual.payment_source,'') IS DISTINCT FROM COALESCE(v_bank.payment_source,'') THEN
    RAISE EXCEPTION 'different_source';
  END IF;
  IF UPPER(COALESCE(v_manual.currency,'')) IS DISTINCT FROM UPPER(COALESCE(v_bank.currency,'')) THEN
    RAISE EXCEPTION 'different_currency';
  END IF;
  IF COALESCE(v_manual.is_advance,false) OR COALESCE(v_bank.is_advance,false) THEN
    RAISE EXCEPTION 'advance_protected';
  END IF;
  IF (v_manual.linked_advance_ids IS NOT NULL AND array_length(v_manual.linked_advance_ids,1) > 0)
     OR (v_bank.linked_advance_ids IS NOT NULL AND array_length(v_bank.linked_advance_ids,1) > 0) THEN
    RAISE EXCEPTION 'advance_protected';
  END IF;

  v_max_amt := GREATEST(ABS(v_manual.amount), ABS(v_bank.amount));
  IF v_max_amt = 0 OR ABS(ABS(v_manual.amount) - ABS(v_bank.amount)) / v_max_amt > 0.001 THEN
    RAISE EXCEPTION 'different_amount';
  END IF;

  v_day_diff := ABS(EXTRACT(DAY FROM (v_manual.date::timestamp - v_bank.date::timestamp))::int);
  IF v_day_diff > 3 THEN RAISE EXCEPTION 'date_too_far'; END IF;

  -- Revert balance effect of bank row (it was applied during import).
  -- Only custom payment sources track balance; preset sources don't.
  IF v_bank.payment_source LIKE 'custom:%' THEN
    BEGIN
      v_source_uuid := substring(v_bank.payment_source FROM 8)::uuid;
      IF v_bank.type = 'expense' THEN
        UPDATE public.custom_payment_sources
           SET balance = COALESCE(balance,0) + ABS(v_bank.amount)
         WHERE id = v_source_uuid;
      ELSIF v_bank.type = 'income' THEN
        UPDATE public.custom_payment_sources
           SET balance = COALESCE(balance,0) - ABS(v_bank.amount)
         WHERE id = v_source_uuid;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Non-fatal: balance revert best-effort; merge still proceeds.
      NULL;
    END;
  END IF;

  -- Promote manual row to confirmed bank match
  UPDATE public.expenses
     SET bank_transaction_id = v_bank.bank_transaction_id,
         bank_account_id     = v_bank.bank_account_id,
         import_batch_id     = v_bank.import_batch_id,
         bank_match_status   = 'confirmed'
   WHERE id = p_manual_id;

  -- Soft-delete bank row
  UPDATE public.expenses
     SET deleted_at = now(),
         deleted_by = v_uid
   WHERE id = p_bank_id;

  RETURN jsonb_build_object('ok', true, 'merged_into', p_manual_id);
END;
$$;
