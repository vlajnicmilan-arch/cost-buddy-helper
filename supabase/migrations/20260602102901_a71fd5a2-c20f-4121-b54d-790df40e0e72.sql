CREATE OR REPLACE FUNCTION public.upsert_active_issue(
  p_type text,
  p_dedup_key text,
  p_severity text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_dedup_key IS NULL OR p_dedup_key = '' THEN RAISE EXCEPTION 'dedup_key_required'; END IF;
  IF p_severity NOT IN ('info','warning','critical') THEN RAISE EXCEPTION 'invalid_severity'; END IF;

  -- Robust 7-day suppression: if ANY dismissed row with this dedup_key exists
  -- within the last 7 days (using best-available timestamp), do not recreate.
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_uid
       AND dedup_key = p_dedup_key
       AND status = 'dismissed'
       AND COALESCE(dismissed_at, last_seen_at, created_at) > now() - interval '7 days'
  ) THEN
    RETURN NULL;
  END IF;

  -- Touch existing active row
  UPDATE public.notifications
     SET last_seen_at = now(),
         data = p_data,
         title = p_title,
         message = p_message,
         severity = p_severity
   WHERE user_id = v_uid
     AND dedup_key = p_dedup_key
     AND status = 'active'
  RETURNING id INTO v_existing_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.notifications (
    user_id, type, title, message, data, severity, dedup_key, entity_type, entity_id, status, last_seen_at
  ) VALUES (
    v_uid, p_type, p_title, p_message, p_data, p_severity, p_dedup_key, p_entity_type, p_entity_id, 'active', now()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Backfill: ensure all historically dismissed rows have a dismissed_at so suppression works.
UPDATE public.notifications
   SET dismissed_at = COALESCE(dismissed_at, last_seen_at, created_at)
 WHERE status = 'dismissed' AND dismissed_at IS NULL;