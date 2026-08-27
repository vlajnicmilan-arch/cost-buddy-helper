CREATE OR REPLACE FUNCTION public.link_person_to_user(p_person_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_skipped jsonb := '[]'::jsonb;
  v_changed int := 0;
  r RECORD;
  v_conflict uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner FROM public.workers WHERE id = p_person_id;
  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'not owner of person' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    UPDATE public.workers SET linked_user_id = NULL WHERE id = p_person_id;
    UPDATE public.project_workers SET user_id = NULL
    WHERE worker_id = p_person_id AND user_id IS NOT NULL;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN jsonb_build_object('linked', false, 'skipped_projects', v_skipped, 'engagements_changed', v_changed);
  END IF;

  -- The account must already be a member of at least one project where this
  -- person is engaged. Access itself still comes from project_members only;
  -- this guard stops the link from handing money data to a non-member.
  IF p_user_id <> v_uid AND NOT EXISTS (
    SELECT 1 FROM public.project_members m
    JOIN public.project_workers w ON w.project_id = m.project_id
    WHERE w.worker_id = p_person_id AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'person_link_user_not_member' USING ERRCODE = '42501';
  END IF;

  UPDATE public.workers SET linked_user_id = p_user_id WHERE id = p_person_id;

  FOR r IN
    SELECT id, project_id FROM public.project_workers
    WHERE worker_id = p_person_id AND (user_id IS DISTINCT FROM p_user_id)
  LOOP
    SELECT id INTO v_conflict FROM public.project_workers
    WHERE project_id = r.project_id AND user_id = p_user_id AND id <> r.id
    LIMIT 1;

    IF v_conflict IS NOT NULL THEN
      PERFORM public._log_person_link_conflict(r.id, p_person_id, r.project_id, v_conflict, p_user_id);
      v_skipped := v_skipped || jsonb_build_array(r.project_id);
    ELSE
      UPDATE public.project_workers SET user_id = p_user_id WHERE id = r.id;
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('linked', true, 'skipped_projects', v_skipped, 'engagements_changed', v_changed);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.link_person_to_user(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_person_to_user(uuid, uuid) TO authenticated;