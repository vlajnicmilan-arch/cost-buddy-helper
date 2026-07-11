
-- krug_deleted_soft_emit: shift user-facing krug_deleted emission from 30-day
-- purge to actual soft-delete moment (solo request + final approve).
-- Purge remains an infra cleanup event and no longer emits notifications.
-- Dedup key `krug_deleted:<krug_id>` is stable across both paths so any
-- accidental double-fire (purge re-emit) is idempotent per user.

-- 1) krug_request_deletion — solo branch emits krug_deleted immediately.
CREATE OR REPLACE FUNCTION public.krug_request_deletion(
  p_krug_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_krug krug%ROWTYPE;
  v_full_count int;
  v_existing krug_deletion_request%ROWTYPE;
  v_snapshot uuid[];
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

    -- Emit krug_deleted on soft-delete (solo owner branch).
    IF v_snapshot IS NOT NULL AND array_length(v_snapshot, 1) IS NOT NULL THEN
      PERFORM public.krug_emit_notification(
        'krug_deleted',
        p_krug_id,
        v_user,
        NULL,
        NULL,
        'krug_deleted:' || p_krug_id::text,
        v_snapshot
      );
    END IF;

    RETURN jsonb_build_object('outcome','ok_deleted_solo','krug_id',p_krug_id);
  END IF;

  INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status, member_snapshot)
  VALUES (p_krug_id, v_user, p_reason, 'pending', v_snapshot);

  INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);

  PERFORM public.krug_emit_notification(
    'krug_deletion_requested',
    p_krug_id,
    v_user,
    NULL,
    p_krug_id,
    'krug_deletion_requested:' || p_krug_id::text,
    NULL
  );

  RETURN jsonb_build_object('outcome','ok_request_created','krug_id',p_krug_id,'full_member_count',v_full_count);
END;
$$;

-- 2) krug_vote_deletion — final approve branch emits krug_deleted immediately.
CREATE OR REPLACE FUNCTION public.krug_vote_deletion(
  p_krug_id uuid,
  p_approve boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req krug_deletion_request%ROWTYPE;
  v_full_count int;
  v_approve_count int;
  v_snapshot uuid[];
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.krug_deletion_request
   WHERE krug_id = p_krug_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome','no_pending_request');
  END IF;

  IF NOT (public.krug_is_owner(p_krug_id, v_user)
          OR EXISTS (
            SELECT 1 FROM krug_membership
             WHERE krug_id = p_krug_id AND user_id = v_user AND role = 'punopravni'
          )) THEN
    RETURN jsonb_build_object('outcome','not_eligible');
  END IF;

  INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve)
  VALUES (p_krug_id, v_user, p_approve)
  ON CONFLICT (krug_id, user_id) DO UPDATE
    SET approve = EXCLUDED.approve, voted_at = now();

  IF p_approve = false THEN
    UPDATE public.krug_deletion_request
       SET status='rejected', resolved_at=now(), resolved_by=v_user
     WHERE krug_id = p_krug_id;
    RETURN jsonb_build_object('outcome','ok_rejected','krug_id',p_krug_id);
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

  SELECT COUNT(*) INTO v_approve_count
    FROM public.krug_deletion_vote
   WHERE krug_id = p_krug_id AND approve = true;

  IF v_approve_count >= v_full_count THEN
    UPDATE public.krug
       SET deleted_at = now(), lifecycle_state = 'deleted'
     WHERE id = p_krug_id;
    UPDATE public.krug_deletion_request
       SET status='approved', resolved_at=now(), resolved_by=v_user
     WHERE krug_id = p_krug_id;

    -- Emit krug_deleted on soft-delete (final approve branch).
    -- Use snapshot captured at request time; fall back to live membership.
    v_snapshot := v_req.member_snapshot;
    IF v_snapshot IS NULL OR array_length(v_snapshot, 1) IS NULL THEN
      SELECT COALESCE(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO v_snapshot
        FROM public.krug_notify_all_members(p_krug_id) AS u;
    END IF;

    IF v_snapshot IS NOT NULL AND array_length(v_snapshot, 1) IS NOT NULL THEN
      PERFORM public.krug_emit_notification(
        'krug_deleted',
        p_krug_id,
        v_user,
        NULL,
        NULL,
        'krug_deleted:' || p_krug_id::text,
        v_snapshot
      );
    END IF;

    RETURN jsonb_build_object('outcome','ok_approved_and_deleted','krug_id',p_krug_id);
  END IF;

  RETURN jsonb_build_object(
    'outcome','ok_vote_recorded',
    'krug_id',p_krug_id,
    'approve_count',v_approve_count,
    'full_member_count',v_full_count
  );
END;
$$;

-- 3) krug_purge_deleted — stop emitting user-facing krug_deleted.
-- Purge is a retention/infra event; user notification already fired at
-- soft-delete moment. Function still returns count of purged rows.
CREATE OR REPLACE FUNCTION public.krug_purge_deleted(p_older_than_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  WITH purged AS (
    DELETE FROM public.krug
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - make_interval(days => p_older_than_days)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM purged;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_purge_deleted(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_purge_deleted(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.krug_request_deletion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_request_deletion(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.krug_vote_deletion(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_vote_deletion(uuid, boolean) TO authenticated, service_role;
