CREATE OR REPLACE FUNCTION public.move_project_to_personal(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_current uuid;
  v_expenses int := 0;
  v_invoices int := 0;
  v_engagements int := 0;
  v_people_created int := 0;
  v_target_worker uuid;
  r RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT user_id, business_profile_id INTO v_owner, v_current
  FROM public.projects
  WHERE id = p_project_id AND deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'only the project owner can move a project' USING ERRCODE = '42501';
  END IF;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'project is already personal' USING ERRCODE = '42501';
  END IF;

  UPDATE public.projects
  SET business_profile_id = NULL,
      updated_at = now()
  WHERE id = p_project_id;

  UPDATE public.expenses
  SET business_profile_id = NULL
  WHERE project_id = p_project_id
    AND user_id = v_uid
    AND business_profile_id IS NOT NULL;
  GET DIAGNOSTICS v_expenses = ROW_COUNT;

  UPDATE public.incoming_invoices ii
  SET business_profile_id = NULL
  WHERE ii.user_id = v_uid
    AND ii.business_profile_id IS NOT NULL
    AND ii.paid_expense_id IN (
      SELECT e.id FROM public.expenses e WHERE e.project_id = p_project_id AND e.user_id = v_uid
    );
  GET DIAGNOSTICS v_invoices = ROW_COUNT;

  -- Engagements keep person identity: reuse an existing personal person with
  -- the same name, otherwise create a NEW personal person.
  -- Never merge with a differently named person.
  FOR r IN
    SELECT pw.id AS engagement_id, w.first_name, w.last_name, w.phone, w.note, w.linked_user_id
    FROM public.project_workers pw
    JOIN public.workers w ON w.id = pw.worker_id
    WHERE pw.project_id = p_project_id
      AND pw.worker_id IS NOT NULL
  LOOP
    SELECT id INTO v_target_worker
    FROM public.workers
    WHERE user_id = v_uid
      AND business_profile_id IS NULL
      AND archived_at IS NULL
      AND lower(btrim(first_name)) = lower(btrim(r.first_name))
      AND lower(btrim(last_name)) = lower(btrim(r.last_name))
    ORDER BY created_at
    LIMIT 1;

    IF v_target_worker IS NULL THEN
      INSERT INTO public.workers (user_id, business_profile_id, first_name, last_name, phone, note, linked_user_id)
      VALUES (v_uid, NULL, r.first_name, r.last_name, r.phone, r.note, r.linked_user_id)
      RETURNING id INTO v_target_worker;
      v_people_created := v_people_created + 1;
    END IF;

    UPDATE public.project_workers
    SET worker_id = v_target_worker,
        business_profile_id = NULL
    WHERE id = r.engagement_id;
    v_engagements := v_engagements + 1;
  END LOOP;

  UPDATE public.project_workers
  SET business_profile_id = NULL
  WHERE project_id = p_project_id
    AND worker_id IS NULL
    AND business_profile_id IS NOT NULL;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'business_profile_id', NULL,
    'expenses_moved', v_expenses,
    'incoming_invoices_moved', v_invoices,
    'engagements_moved', v_engagements,
    'people_created', v_people_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.move_project_to_personal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_project_to_personal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_project_to_personal(uuid) TO authenticated;