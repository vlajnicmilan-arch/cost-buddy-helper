-- Krug Notifications MVP — server-side canonical writer path.
--
-- Pipeline:
--   RPC / edge fn state change
--     └─> krug_emit_notification(...)  (net.http_post, fire-and-forget)
--           └─> edge fn notify-krug-event (recipient resolver, dedup, insert + push)
--
-- Recipient rules live server-side; owner is always UNION-ed via krug_ownership
-- (never trusted to be in krug_membership). Dedup is anchored on the existing
-- krug_act_dedup.id (for approval acts) or on stable expense/krug ids — no
-- new sequence column.

-- =====================================================================
-- 1) Preferences: one MVP toggle + gate
-- =====================================================================
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS krug_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.is_push_category_enabled(_user_id uuid, _category text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pref RECORD;
BEGIN
  SELECT * INTO v_pref FROM public.notification_preferences WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RETURN true; -- default ON
  END IF;

  RETURN CASE _category
    WHEN 'chat'          THEN v_pref.chat_enabled
    WHEN 'transactions'  THEN v_pref.transactions_enabled
    WHEN 'pending'       THEN v_pref.pending_enabled
    WHEN 'projects'      THEN v_pref.projects_enabled
    WHEN 'budgets'       THEN v_pref.budgets_enabled
    WHEN 'reminders'     THEN v_pref.reminders_enabled
    WHEN 'trial'         THEN v_pref.trial_enabled
    WHEN 'broadcast'     THEN v_pref.broadcast_enabled
    WHEN 'daily_summary' THEN v_pref.daily_summary_enabled
    WHEN 'krug'          THEN v_pref.krug_enabled
    ELSE true
  END;
END;
$function$;

-- =====================================================================
-- 2) Deletion snapshot: audience for krug_deleted after purge
-- =====================================================================
ALTER TABLE public.krug_deletion_request
  ADD COLUMN IF NOT EXISTS member_snapshot uuid[];

-- =====================================================================
-- 3) Recipient helpers — owner explicitly UNION-ed
-- =====================================================================
CREATE OR REPLACE FUNCTION public.krug_notify_full_members(p_krug_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.krug_ownership
   WHERE krug_id = p_krug_id
  UNION
  SELECT user_id FROM public.krug_membership
   WHERE krug_id = p_krug_id
     AND role = 'punopravni'::public.krug_membership_role
$$;

CREATE OR REPLACE FUNCTION public.krug_notify_all_members(p_krug_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.krug_ownership
   WHERE krug_id = p_krug_id
  UNION
  SELECT user_id FROM public.krug_membership
   WHERE krug_id = p_krug_id
$$;

REVOKE EXECUTE ON FUNCTION public.krug_notify_full_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_notify_full_members(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.krug_notify_all_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_notify_all_members(uuid) TO authenticated, service_role;

-- =====================================================================
-- 4) Emit helper — net.http_post to notify-krug-event
-- =====================================================================
CREATE OR REPLACE FUNCTION public.krug_emit_notification(
  p_event_type text,
  p_krug_id uuid,
  p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL,
  p_deletion_request_id uuid DEFAULT NULL,
  p_dedup_ref text DEFAULT NULL,
  p_recipient_override uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-krug-event';
  _apikey text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', _apikey,
      'Authorization', 'Bearer ' || _apikey
    ),
    body := jsonb_build_object(
      'event_type', p_event_type,
      'krug_id', p_krug_id,
      'actor_id', p_actor_id,
      'expense_id', p_expense_id,
      'deletion_request_id', p_deletion_request_id,
      'dedup_ref', p_dedup_ref,
      'recipient_override', p_recipient_override
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Never block the caller RPC on notification dispatch.
  RAISE WARNING 'krug_emit_notification failed: %', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[]) TO service_role;

-- =====================================================================
-- 5) krug_set_privacy — emit 'krug_expense_proposed' on shared+predlozena
-- =====================================================================
CREATE OR REPLACE FUNCTION public.krug_set_privacy(
  p_expense_id uuid,
  p_new_privacy public.krug_privacy
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _prev_privacy public.krug_privacy;
  _prev_status public.krug_shared_status;
  _new_status public.krug_shared_status := NULL;
  _outcome text;
  _emit_proposed boolean := false;
BEGIN
  IF _viewer IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthenticated');
  END IF;

  SELECT id, user_id, krug_id, krug_privacy, krug_shared_status
    INTO _exp
  FROM public.expenses
  WHERE id = p_expense_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','expense_id',p_expense_id);
  END IF;

  IF _exp.krug_id IS NULL THEN
    RETURN jsonb_build_object('outcome','not_in_krug_context','expense_id',p_expense_id);
  END IF;

  IF _exp.user_id <> _viewer THEN
    RETURN jsonb_build_object('outcome','not_author','expense_id',p_expense_id);
  END IF;

  _prev_privacy := _exp.krug_privacy;
  _prev_status  := _exp.krug_shared_status;

  IF _prev_privacy = p_new_privacy
     AND (p_new_privacy <> 'shared'::public.krug_privacy
          OR _prev_status = 'predlozena'::public.krug_shared_status) THEN
    RETURN jsonb_build_object(
      'outcome','noop_already_in_target_state',
      'expense_id',_exp.id,
      'krug_id',_exp.krug_id,
      'previous_privacy',_prev_privacy,
      'new_privacy',_prev_privacy,
      'previous_status',_prev_status,
      'new_status',_prev_status
    );
  END IF;

  IF _prev_privacy = 'shared'::public.krug_privacy THEN
    RETURN jsonb_build_object(
      'outcome','wrong_state',
      'expense_id',_exp.id,
      'krug_id',_exp.krug_id,
      'previous_privacy',_prev_privacy,
      'previous_status',_prev_status
    );
  END IF;

  IF p_new_privacy = 'shared'::public.krug_privacy THEN
    IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
      RETURN jsonb_build_object(
        'outcome','not_full_member',
        'expense_id',_exp.id,
        'krug_id',_exp.krug_id
      );
    END IF;
    _new_status := 'predlozena'::public.krug_shared_status;
    _outcome := 'ok_proposed_shared';
    _emit_proposed := true;

  ELSIF p_new_privacy IN ('personal'::public.krug_privacy, 'private'::public.krug_privacy) THEN
    IF _prev_status IS NOT NULL THEN
      RETURN jsonb_build_object(
        'outcome','wrong_state',
        'expense_id',_exp.id,
        'krug_id',_exp.krug_id,
        'previous_privacy',_prev_privacy,
        'previous_status',_prev_status
      );
    END IF;
    _outcome := CASE p_new_privacy
      WHEN 'personal'::public.krug_privacy THEN 'ok_set_personal'
      WHEN 'private'::public.krug_privacy  THEN 'ok_set_private'
    END;
  ELSE
    RETURN jsonb_build_object('outcome','invalid_target','expense_id',_exp.id);
  END IF;

  UPDATE public.expenses
     SET krug_privacy = p_new_privacy,
         krug_shared_status = _new_status,
         updated_at = now()
   WHERE id = _exp.id;

  -- Canonical emit ONLY on genuine transition to shared+predlozena.
  IF _emit_proposed
     AND p_new_privacy = 'shared'::public.krug_privacy
     AND _new_status = 'predlozena'::public.krug_shared_status
  THEN
    PERFORM public.krug_emit_notification(
      'krug_expense_proposed',
      _exp.krug_id,
      _viewer,
      _exp.id,
      NULL,
      'krug_expense_proposed:setp:' || _exp.id::text,
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'outcome',_outcome,
    'expense_id',_exp.id,
    'krug_id',_exp.krug_id,
    'previous_privacy',_prev_privacy,
    'new_privacy',p_new_privacy,
    'previous_status',_prev_status,
    'new_status',_new_status
  );
END;
$$;

-- Preserve original grants.
REVOKE EXECUTE ON FUNCTION public.krug_set_privacy(uuid, public.krug_privacy) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_set_privacy(uuid, public.krug_privacy) TO authenticated, service_role;

-- =====================================================================
-- 6) krug_apply_act — emit confirmed/rejected/proposed; dedup via act row id
-- =====================================================================
CREATE OR REPLACE FUNCTION public.krug_apply_act(
  p_expense_id uuid,
  p_act text,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _prev_status public.krug_shared_status;
  _new_status public.krug_shared_status;
  _outcome text;
  _dedup_hit record;
  _dedup_id uuid;
BEGIN
  IF _viewer IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthenticated');
  END IF;

  IF p_act NOT IN ('A1','A2','A5') THEN
    RETURN jsonb_build_object('outcome','invalid_act','act',p_act);
  END IF;

  IF coalesce(p_client_request_id,'') = '' THEN
    RETURN jsonb_build_object('outcome','missing_client_request_id');
  END IF;

  SELECT outcome INTO _dedup_hit
  FROM public.krug_act_dedup
  WHERE user_id = _viewer
    AND expense_id = p_expense_id
    AND act = p_act
    AND client_request_id = p_client_request_id
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', _dedup_hit.outcome,
      'expense_id', p_expense_id,
      'replayed', true
    );
  END IF;

  SELECT id, user_id, krug_id, krug_privacy, krug_shared_status
    INTO _exp
  FROM public.expenses
  WHERE id = p_expense_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','expense_id',p_expense_id);
  END IF;

  IF _exp.krug_id IS NULL OR _exp.krug_privacy <> 'shared'::public.krug_privacy THEN
    RETURN jsonb_build_object('outcome','not_in_shared_flow','expense_id',_exp.id);
  END IF;

  _prev_status := _exp.krug_shared_status;
  _new_status := _prev_status;

  IF p_act IN ('A1','A2') THEN
    IF _exp.user_id = _viewer THEN
      RETURN jsonb_build_object('outcome','author_cannot_govern','expense_id',_exp.id);
    END IF;
    IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
      RETURN jsonb_build_object('outcome','not_full_member','expense_id',_exp.id);
    END IF;
    IF _prev_status <> 'predlozena'::public.krug_shared_status THEN
      RETURN jsonb_build_object(
        'outcome','wrong_state',
        'expense_id',_exp.id,
        'previous_status',_prev_status
      );
    END IF;

    IF p_act = 'A1' THEN
      _new_status := 'potvrdjena'::public.krug_shared_status;
      _outcome := 'ok_confirmed';
    ELSE
      _new_status := 'nepotvrdjena'::public.krug_shared_status;
      _outcome := 'ok_negated';
    END IF;

  ELSIF p_act = 'A5' THEN
    IF _exp.user_id <> _viewer THEN
      RETURN jsonb_build_object('outcome','not_author','expense_id',_exp.id);
    END IF;
    IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
      RETURN jsonb_build_object('outcome','not_full_member','expense_id',_exp.id);
    END IF;
    IF _prev_status NOT IN ('potvrdjena'::public.krug_shared_status,'nepotvrdjena'::public.krug_shared_status) THEN
      RETURN jsonb_build_object(
        'outcome','wrong_state',
        'expense_id',_exp.id,
        'previous_status',_prev_status
      );
    END IF;
    _new_status := 'predlozena'::public.krug_shared_status;
    _outcome := 'ok_reproposed';
  END IF;

  IF _prev_status = _new_status THEN
    _outcome := 'noop_already_in_target_state';
  ELSE
    UPDATE public.expenses
       SET krug_shared_status = _new_status,
           updated_at = now()
     WHERE id = _exp.id;
  END IF;

  INSERT INTO public.krug_act_dedup(user_id, expense_id, act, client_request_id, outcome)
  VALUES (_viewer, _exp.id, p_act, p_client_request_id, _outcome)
  ON CONFLICT (user_id, expense_id, act, client_request_id) DO NOTHING
  RETURNING id INTO _dedup_id;

  -- Emit only on real state transitions (skip noop replays).
  IF _dedup_id IS NOT NULL AND _prev_status <> _new_status THEN
    IF p_act = 'A1' THEN
      -- Confirm → notify author
      PERFORM public.krug_emit_notification(
        'krug_expense_confirmed',
        _exp.krug_id,
        _viewer,
        _exp.id,
        NULL,
        'krug_expense_confirmed:act:' || _dedup_id::text,
        ARRAY[_exp.user_id]::uuid[]
      );
    ELSIF p_act = 'A2' THEN
      PERFORM public.krug_emit_notification(
        'krug_expense_rejected',
        _exp.krug_id,
        _viewer,
        _exp.id,
        NULL,
        'krug_expense_rejected:act:' || _dedup_id::text,
        ARRAY[_exp.user_id]::uuid[]
      );
    ELSIF p_act = 'A5' THEN
      -- Re-propose → notify full members (edge fn resolves, excludes actor)
      PERFORM public.krug_emit_notification(
        'krug_expense_proposed',
        _exp.krug_id,
        _viewer,
        _exp.id,
        NULL,
        'krug_expense_proposed:act:' || _dedup_id::text,
        NULL
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'outcome', _outcome,
    'expense_id', _exp.id,
    'krug_id', _exp.krug_id,
    'previous_status', _prev_status,
    'new_status', _new_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_apply_act(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_apply_act(uuid, text, text) TO authenticated, service_role;

-- =====================================================================
-- 7) krug_request_deletion — snapshot audience + emit deletion_requested
-- =====================================================================
CREATE OR REPLACE FUNCTION public.krug_request_deletion(
  p_krug_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_krug krug%ROWTYPE;
  v_full_count int;
  v_existing krug_deletion_request%ROWTYPE;
  v_snapshot uuid[];
  v_new_request_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;

  SELECT * INTO v_krug FROM public.krug WHERE id = p_krug_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','krug_not_found');
  END IF;
  IF v_krug.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','already_deleted');
  END IF;

  IF NOT public.krug_is_owner(p_krug_id, v_user) THEN
    RETURN jsonb_build_object('outcome','not_owner');
  END IF;

  SELECT * INTO v_existing
    FROM public.krug_deletion_request
   WHERE krug_id = p_krug_id AND status = 'pending'
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome','request_already_pending');
  END IF;

  SELECT
    (CASE WHEN EXISTS (SELECT 1 FROM krug_ownership WHERE krug_id = p_krug_id) THEN 1 ELSE 0 END)
    + COALESCE((
        SELECT COUNT(*) FROM krug_membership
         WHERE krug_id = p_krug_id
           AND role = 'punopravni'
           AND user_id <> (SELECT user_id FROM krug_ownership WHERE krug_id = p_krug_id)
      ), 0)
  INTO v_full_count;

  -- Snapshot audience BEFORE any mutation. Used later by krug_purge_deleted
  -- to send krug_deleted after the row is gone.
  SELECT COALESCE(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO v_snapshot
    FROM public.krug_notify_all_members(p_krug_id) AS u;

  DELETE FROM public.krug_deletion_request WHERE krug_id = p_krug_id;

  IF v_full_count <= 1 THEN
    UPDATE public.krug
       SET deleted_at = now(),
           lifecycle_state = 'deleted'
     WHERE id = p_krug_id;
    INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status, resolved_at, resolved_by, member_snapshot)
    VALUES (p_krug_id, v_user, p_reason, 'approved', now(), v_user, v_snapshot);
    INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);
    -- Solo path: no other members to notify about the deletion request itself.
    RETURN jsonb_build_object('outcome','ok_deleted_solo','krug_id',p_krug_id);
  END IF;

  INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status, member_snapshot)
  VALUES (p_krug_id, v_user, p_reason, 'pending', v_snapshot)
  RETURNING id INTO v_new_request_id;

  INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);

  PERFORM public.krug_emit_notification(
    'krug_deletion_requested',
    p_krug_id,
    v_user,
    NULL,
    v_new_request_id,
    'krug_deletion_requested:' || v_new_request_id::text,
    NULL
  );

  RETURN jsonb_build_object('outcome','ok_request_created','krug_id',p_krug_id,'full_member_count',v_full_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_request_deletion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_request_deletion(uuid, text) TO authenticated, service_role;

-- =====================================================================
-- 8) krug_purge_deleted — emit krug_deleted using snapshot before physical delete
-- =====================================================================
CREATE OR REPLACE FUNCTION public.krug_purge_deleted(p_older_than_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_recipients uuid[];
  v_actor uuid;
  v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT k.id AS krug_id,
           k.deleted_by,
           (SELECT kdr.member_snapshot
              FROM public.krug_deletion_request kdr
             WHERE kdr.krug_id = k.id
               AND kdr.status = 'approved'
             ORDER BY kdr.resolved_at DESC NULLS LAST
             LIMIT 1) AS snapshot
      FROM public.krug k
     WHERE k.deleted_at IS NOT NULL
       AND k.deleted_at < now() - make_interval(days => p_older_than_days)
  LOOP
    v_recipients := v_row.snapshot;
    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
      SELECT COALESCE(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO v_recipients
        FROM public.krug_notify_all_members(v_row.krug_id) AS u;
    END IF;

    v_actor := COALESCE(v_row.deleted_by, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) IS NOT NULL THEN
      PERFORM public.krug_emit_notification(
        'krug_deleted',
        v_row.krug_id,
        v_actor,
        NULL,
        NULL,
        'krug_deleted:' || v_row.krug_id::text,
        v_recipients
      );
    END IF;

    DELETE FROM public.krug WHERE id = v_row.krug_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_purge_deleted(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_purge_deleted(int) TO service_role;