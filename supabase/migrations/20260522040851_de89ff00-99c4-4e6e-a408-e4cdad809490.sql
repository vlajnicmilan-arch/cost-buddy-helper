
-- Phase 1: Extend notifications into an active-issue system

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS dedup_key text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('active','resolved','dismissed'));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_severity_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_severity_check
  CHECK (severity IN ('info','warning','critical'));

-- Backfill severity from known types
UPDATE public.notifications
  SET severity = 'warning'
  WHERE severity = 'info' AND type IN ('project_loss_zone');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_status
  ON public.notifications (user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_active_dedup
  ON public.notifications (user_id, dedup_key)
  WHERE status = 'active' AND dedup_key IS NOT NULL;

-- ============================================================
-- RPCs (SECURITY DEFINER — bypass INSERT-blocking RLS for trusted ops)
-- ============================================================

-- Dismiss by id
CREATE OR REPLACE FUNCTION public.dismiss_notification(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.notifications
     SET status = 'dismissed', dismissed_at = now()
   WHERE id = p_id AND user_id = v_uid AND status = 'active';
END;
$$;

-- Upsert an issue (used by client reconciler).
-- If active with same dedup_key exists → touch last_seen_at + refresh data/title/message/severity.
-- Otherwise INSERT new active row.
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

  -- Skip if user previously dismissed this exact issue and it hasn't been resolved in between
  -- (so a dismissed issue won't auto-reappear on next reconcile)
  SELECT id INTO v_existing_id
    FROM public.notifications
   WHERE user_id = v_uid
     AND dedup_key = p_dedup_key
     AND status = 'dismissed'
   ORDER BY dismissed_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Only suppress for 7 days after dismiss, then allow re-creation
    IF (SELECT dismissed_at FROM public.notifications WHERE id = v_existing_id) > now() - interval '7 days' THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Try update active first
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

-- Resolve all active issues whose dedup_key is NOT in the provided list (per type prefix).
-- p_type_prefix lets us scope auto-resolve to a single detector (e.g. 'project_loss_zone').
CREATE OR REPLACE FUNCTION public.resolve_stale_issues(
  p_type_prefix text,
  p_active_dedup_keys text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.notifications
     SET status = 'resolved', resolved_at = now()
   WHERE user_id = v_uid
     AND status = 'active'
     AND type = p_type_prefix
     AND dedup_key IS NOT NULL
     AND NOT (dedup_key = ANY(COALESCE(p_active_dedup_keys, ARRAY[]::text[])));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_active_issue(text, text, text, text, text, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_stale_issues(text, text[]) TO authenticated;
