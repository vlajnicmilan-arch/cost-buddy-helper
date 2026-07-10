CREATE OR REPLACE FUNCTION public.krug_request_deletion(p_krug_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RETURN jsonb_build_object('outcome','ok_deleted_solo','krug_id',p_krug_id);
  END IF;

  INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status, member_snapshot)
  VALUES (p_krug_id, v_user, p_reason, 'pending', v_snapshot);

  INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);

  -- krug_deletion_request nema surrogate id; PK je krug_id i postoji max 1 pending
  -- request po krugu, pa krug_id služi kao stabilan identifier za notification payload
  -- i dedup ključ.
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
$function$;