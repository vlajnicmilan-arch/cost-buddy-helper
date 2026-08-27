-- Person-level account link (Ljudi). Does NOT touch balances, expenses or access rights.

CREATE OR REPLACE FUNCTION public._log_person_link_conflict(
  p_worker_id uuid, p_person_id uuid, p_project_id uuid,
  p_existing_engagement_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.app_diagnostics_logs (session_id, user_id, event, severity, details)
  VALUES (
    'db-trigger', p_user_id, 'person_link_conflict_skipped', 'warning',
    jsonb_build_object(
      'worker_id', p_worker_id,
      'person_id', p_person_id,
      'project_id', p_project_id,
      'existing_engagement_id', p_existing_engagement_id,
      'user_id', p_user_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._log_person_link_conflict(uuid, uuid, uuid, uuid, uuid) FROM anon, PUBLIC;

-- (a) upwards: engagement gets an account -> person and all her other engagements follow
CREATE OR REPLACE FUNCTION public._person_link_propagate_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_linked uuid;
  r RECORD;
  v_conflict uuid;
BEGIN
  IF NEW.user_id IS NULL OR NEW.worker_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT linked_user_id INTO v_linked FROM public.workers WHERE id = NEW.worker_id;
  IF NOT FOUND OR v_linked IS NOT NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.workers SET linked_user_id = NEW.user_id WHERE id = NEW.worker_id;

  FOR r IN
    SELECT id, project_id FROM public.project_workers
    WHERE worker_id = NEW.worker_id AND user_id IS NULL AND id <> NEW.id
  LOOP
    SELECT id INTO v_conflict FROM public.project_workers
    WHERE project_id = r.project_id AND user_id = NEW.user_id AND id <> r.id
    LIMIT 1;

    IF v_conflict IS NOT NULL THEN
      PERFORM public._log_person_link_conflict(r.id, NEW.worker_id, r.project_id, v_conflict, NEW.user_id);
    ELSE
      UPDATE public.project_workers SET user_id = NEW.user_id WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._person_link_propagate_up() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_person_link_propagate_up ON public.project_workers;
CREATE TRIGGER trg_person_link_propagate_up
AFTER UPDATE OF user_id ON public.project_workers
FOR EACH ROW
WHEN (NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id)
EXECUTE FUNCTION public._person_link_propagate_up();

-- (b) downwards: new engagement of an already linked person inherits the account
CREATE OR REPLACE FUNCTION public._person_link_inherit_down()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_linked uuid;
  v_conflict uuid;
BEGIN
  IF NEW.worker_id IS NULL OR NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT linked_user_id INTO v_linked FROM public.workers WHERE id = NEW.worker_id;
  IF v_linked IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_conflict FROM public.project_workers
  WHERE project_id = NEW.project_id AND user_id = v_linked
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    PERFORM public._log_person_link_conflict(NEW.id, NEW.worker_id, NEW.project_id, v_conflict, v_linked);
    RETURN NEW;
  END IF;

  NEW.user_id := v_linked;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._person_link_inherit_down() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_person_link_inherit_down ON public.project_workers;
CREATE TRIGGER trg_person_link_inherit_down
BEFORE INSERT ON public.project_workers
FOR EACH ROW
EXECUTE FUNCTION public._person_link_inherit_down();

-- (d) explicit link / unlink at person level
CREATE OR REPLACE FUNCTION public.link_person_to_user(p_person_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_skipped jsonb := '[]'::jsonb;
  v_linked int := 0;
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
    GET DIAGNOSTICS v_linked = ROW_COUNT;
    RETURN jsonb_build_object('linked', false, 'skipped_projects', v_skipped, 'engagements_linked', v_linked);
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
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('linked', true, 'skipped_projects', v_skipped, 'engagements_linked', v_linked);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_person_to_user(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_person_to_user(uuid, uuid) TO authenticated;