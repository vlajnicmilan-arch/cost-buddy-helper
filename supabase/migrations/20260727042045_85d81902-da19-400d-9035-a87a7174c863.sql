-- Faza C2 — Krug settlement reminder preference + additive push on mark_settled.

-- 1) New preference column (mirror of krug_enabled pattern).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS krug_settlement_reminder_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.krug_settlement_reminder_enabled IS
  'C2: weekly Krug settlement reminder toggle (Monday 08:00 UTC). Independent from krug_enabled — user can silence reminders while keeping transactional Krug pushes.';

-- 2) krug_mark_settled — CREATE OR REPLACE from LIVE pg_get_functiondef.
--    Additive change ONLY: PERFORM krug_emit_notification in EXCEPTION wrap,
--    AFTER INSERT ... RETURNING id INTO v_id, BEFORE RETURN. Advisory lock,
--    INSERT, RETURN shape, signature all bit-identical to live definition.
CREATE OR REPLACE FUNCTION public.krug_mark_settled(
  p_krug_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount numeric,
  p_currency text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- C2: additive best-effort push. Notify FAILURE MUST NOT abort settlement.
  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_settlement_marked_settled',
      p_krug_id := p_krug_id,
      p_actor_id := v_uid,
      p_dedup_ref := 'settled:'||v_id::text
      -- recipient_override NULL → resolver targets full members, actor excluded
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_mark_settled: notify failed (id=%): %', v_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $function$;
