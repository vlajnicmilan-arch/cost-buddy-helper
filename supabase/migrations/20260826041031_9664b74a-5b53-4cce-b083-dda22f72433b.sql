-- 1) Root cause: cascade delete of rate history (parent worker gone) must be allowed
CREATE OR REPLACE FUNCTION public._guard_rate_history_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_allow text := current_setting('app.allow_rate_write', true);
BEGIN
  IF v_allow = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Allow cascade cleanup: parent project_workers row is already deleted.
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.project_workers w WHERE w.id = OLD.worker_id)
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'project_worker_rate_history: direct write forbidden. Use set_worker_hourly_rate RPC.'
    USING ERRCODE = '42501';
END;
$function$;

-- 2) Archive field on the engagement
ALTER TABLE public.project_workers ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 3) Delete RPC with truthful reasons
CREATE OR REPLACE FUNCTION public.delete_project_worker(_worker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
  v_payouts int;
BEGIN
  SELECT project_id INTO v_project FROM public.project_workers WHERE id = _worker_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_project_owner(v_project, auth.uid()) THEN
    RAISE EXCEPTION 'not_project_owner' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_payouts
  FROM public.project_worker_payouts p WHERE p.worker_id = _worker_id;

  IF v_payouts > 0 THEN
    RAISE EXCEPTION 'worker_has_payouts|%', v_payouts USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_work_entries e
             WHERE e.worker_id = _worker_id AND e.payout_id IS NOT NULL) THEN
    RAISE EXCEPTION 'worker_has_locked_entries' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.project_workers WHERE id = _worker_id;
  RETURN jsonb_build_object('deleted', true, 'project_id', v_project);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_project_worker(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_worker(uuid) TO authenticated;

-- 4) Archive RPC (does not touch payouts)
CREATE OR REPLACE FUNCTION public.archive_project_worker(_worker_id uuid, _archived boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.project_workers WHERE id = _worker_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_project_owner(v_project, auth.uid()) THEN
    RAISE EXCEPTION 'not_project_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.project_workers
     SET archived_at = CASE WHEN _archived THEN now() ELSE NULL END
   WHERE id = _worker_id;

  RETURN jsonb_build_object('archived', _archived, 'project_id', v_project);
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_project_worker(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_project_worker(uuid, boolean) TO authenticated;