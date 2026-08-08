CREATE OR REPLACE FUNCTION public.krug_mark_settled(p_krug_id uuid, p_from_user uuid, p_to_user uuid, p_amount numeric, p_currency text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock bigint;
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
  -- Samo dužnik smije zabilježiti da je platio.
  IF v_uid <> p_from_user THEN
    RAISE EXCEPTION 'only_debtor_can_settle' USING ERRCODE = '42501';
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

  -- Advisory lock po kanonskom paru (min,max) — JEDAN bigint ključ.
  -- Dvoargumentna forma pg_advisory_xact_lock postoji samo kao (int4,int4),
  -- pa je stari poziv s (bigint,bigint) uvijek padao na 42883.
  v_lock := hashtextextended(
    p_krug_id::text || ':' ||
    LEAST(p_from_user, p_to_user)::text || ':' ||
    GREATEST(p_from_user, p_to_user)::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock);

  INSERT INTO public.krug_settlement_ledger(
    krug_id, from_user, to_user, amount, currency, note, marked_by
  ) VALUES (
    p_krug_id, p_from_user, p_to_user, p_amount, upper(p_currency), NULLIF(p_note,''), v_uid
  ) RETURNING id INTO v_id;

  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_settlement_marked_settled',
      p_krug_id := p_krug_id,
      p_actor_id := v_uid,
      p_dedup_ref := 'settled:'||v_id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_mark_settled: notify failed (id=%): %', v_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $function$;

CREATE OR REPLACE FUNCTION public.krug_void_settlement(p_ledger_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Poništenje je zaštita obiju strana duga: dopušteno dužniku i vjerovniku.
  IF v_uid <> v_row.from_user AND v_uid <> v_row.to_user THEN
    RAISE EXCEPTION 'only_party_can_void' USING ERRCODE = '42501';
  END IF;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided' USING ERRCODE = '22023';
  END IF;

  UPDATE public.krug_settlement_ledger
     SET voided_at = now(), voided_by = v_uid, void_reason = trim(p_reason), updated_at = now()
   WHERE id = p_ledger_id;

  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE EXECUTE ON FUNCTION public.krug_mark_settled(uuid,uuid,uuid,numeric,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_void_settlement(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_mark_settled(uuid,uuid,uuid,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.krug_void_settlement(uuid,text) TO authenticated;