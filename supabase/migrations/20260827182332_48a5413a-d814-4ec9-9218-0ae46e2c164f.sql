-- C) Collaborator deletion with an honest reason.
CREATE OR REPLACE FUNCTION public.delete_collaborator(p_collaborator_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_live_count int;
  v_live_sum numeric;
  v_removed int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT p.user_id INTO v_owner
  FROM public.project_collaborators c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = p_collaborator_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'collaborator_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'not_project_owner' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0)
    INTO v_live_count, v_live_sum
  FROM public.project_collaborator_payments
  WHERE collaborator_id = p_collaborator_id
    AND status = 'paid'
    AND voided_at IS NULL
    AND deleted_at IS NULL;

  IF v_live_count > 0 THEN
    RAISE EXCEPTION 'collaborator_has_live_payments|%|%',
      v_live_count, to_char(v_live_sum, 'FM999999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- Only voided/soft-deleted payments remain: they carry no live expense, so
  -- removing them changes no balance.
  DELETE FROM public.project_collaborator_payments
  WHERE collaborator_id = p_collaborator_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  DELETE FROM public.project_collaborators WHERE id = p_collaborator_id;

  RETURN jsonb_build_object('deleted', true, 'voided_payments_removed', v_removed);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_collaborator(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_collaborator(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_collaborator(uuid) TO authenticated;

-- E) Permanent project removal must not break on collaborator payments.
-- Aligned with project_worker_payouts.project_id (already ON DELETE CASCADE).
ALTER TABLE public.project_collaborator_payments
  DROP CONSTRAINT project_collaborator_payments_project_id_fkey;

ALTER TABLE public.project_collaborator_payments
  ADD CONSTRAINT project_collaborator_payments_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;