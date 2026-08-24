CREATE OR REPLACE FUNCTION public.merge_manual_with_bank(p_manual_id uuid, p_bank_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_manual RECORD;
  v_bank RECORD;
  v_max_amt numeric;
  v_day_diff int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_manual FROM public.expenses WHERE id = p_manual_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual_not_found'; END IF;
  IF v_manual.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'manual_deleted'; END IF;
  IF v_manual.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_manual.bank_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'manual_is_bank'; END IF;
  IF v_manual.bank_match_status = 'confirmed' THEN RAISE EXCEPTION 'already_confirmed'; END IF;

  SELECT * INTO v_bank FROM public.expenses WHERE id = p_bank_id FOR UPDATE;
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

  v_day_diff := ABS((v_manual.date AT TIME ZONE 'UTC')::date - (v_bank.date AT TIME ZONE 'UTC')::date);
  IF v_day_diff > 4 THEN RAISE EXCEPTION 'date_too_far'; END IF;

  -- 1) Release the bank identity BEFORE promoting the manual row.
  --    uniq_expenses_user_bank_tx is a plain unique index (soft-deleted rows
  --    still occupy it), so the fingerprint must move, not be duplicated.
  --    No manual balance arithmetic here: trg_expenses_recompute_source_balance
  --    already reverts the soft-deleted row's effect (double revert = corruption).
  UPDATE public.expenses
     SET bank_transaction_id = NULL,
         bank_match_status   = 'merged_into_manual',
         deleted_at          = now(),
         deleted_by          = v_uid
   WHERE id = p_bank_id;

  -- 2) Promote the manual/scanned row: it keeps ALL of its own content
  --    (description, category, receipt, items, project/budget/krug links)
  --    and inherits the full bank identity.
  UPDATE public.expenses
     SET bank_transaction_id  = v_bank.bank_transaction_id,
         bank_account_id      = COALESCE(v_bank.bank_account_id, bank_account_id),
         import_batch_id      = COALESCE(v_bank.import_batch_id, import_batch_id),
         balance_after        = v_bank.balance_after,
         bank_row_seq         = v_bank.bank_row_seq,
         bank_raw_line        = v_bank.bank_raw_line,
         bank_raw_line_source = v_bank.bank_raw_line_source,
         date                 = v_bank.date,
         bank_match_status    = 'confirmed'
   WHERE id = p_manual_id;

  RETURN jsonb_build_object(
    'ok', true,
    'merged_into', p_manual_id,
    'archived_bank_id', p_bank_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_manual_with_bank(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_manual_with_bank(uuid, uuid) TO authenticated;