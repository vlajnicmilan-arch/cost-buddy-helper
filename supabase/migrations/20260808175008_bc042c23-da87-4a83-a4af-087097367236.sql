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
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
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

  RETURN jsonb_build_object('ok', true);
END $function$;