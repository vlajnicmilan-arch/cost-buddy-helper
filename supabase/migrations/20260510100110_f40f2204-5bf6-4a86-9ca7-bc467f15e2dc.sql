-- Function: link worker to project member + backfill existing work logs
CREATE OR REPLACE FUNCTION public.link_worker_to_member(
  _worker_id uuid,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_owner uuid;
  v_caller uuid := auth.uid();
  v_backfilled int := 0;
  v_existing uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Load worker + project
  SELECT pw.project_id, p.user_id
    INTO v_project_id, v_owner
  FROM public.project_workers pw
  JOIN public.projects p ON p.id = pw.project_id
  WHERE pw.id = _worker_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'worker_not_found';
  END IF;

  -- Only project owner or manager can link
  IF v_owner <> v_caller AND NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = v_project_id AND user_id = v_caller AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- If unlinking
  IF _user_id IS NULL THEN
    UPDATE public.project_workers SET user_id = NULL WHERE id = _worker_id;
    RETURN jsonb_build_object('success', true, 'unlinked', true);
  END IF;

  -- Prevent linking same user to multiple workers in same project
  SELECT id INTO v_existing
  FROM public.project_workers
  WHERE project_id = v_project_id AND user_id = _user_id AND id <> _worker_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'user_already_linked_to_other_worker';
  END IF;

  -- Update link
  UPDATE public.project_workers SET user_id = _user_id WHERE id = _worker_id;

  -- Backfill: for every existing work_log of this user on this project,
  -- upsert a corresponding project_work_entries row.
  INSERT INTO public.project_work_entries (
    worker_id, project_id, work_date,
    scheduled_hours, actual_hours, note, milestone_ids, business_profile_id
  )
  SELECT
    _worker_id, pwl.project_id, pwl.log_date,
    pwl.hours, pwl.hours, pwl.summary,
    CASE WHEN pwl.milestone_id IS NULL THEN NULL ELSE ARRAY[pwl.milestone_id] END,
    (SELECT business_profile_id FROM public.project_workers WHERE id = _worker_id)
  FROM public.project_work_logs pwl
  WHERE pwl.project_id = v_project_id
    AND pwl.user_id = _user_id
    AND pwl.hours IS NOT NULL
  ON CONFLICT (worker_id, work_date) DO UPDATE
    SET actual_hours = EXCLUDED.actual_hours,
        scheduled_hours = EXCLUDED.scheduled_hours,
        note = EXCLUDED.note,
        milestone_ids = EXCLUDED.milestone_ids,
        updated_at = now();

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'backfilled', v_backfilled
  );
END;
$$;