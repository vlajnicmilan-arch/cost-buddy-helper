-- V2-A: batch worker payouts (cross-project).

-- 1) batch_id column
ALTER TABLE public.project_worker_payouts
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_payouts_batch
  ON public.project_worker_payouts(batch_id);

-- 2) RPC: create_worker_payout_batch
--    p_items: jsonb array of { project_id, worker_id, period_start, period_end, paid_amount }
CREATE OR REPLACE FUNCTION public.create_worker_payout_batch(
  p_items          jsonb,
  p_payment_source text,
  p_paid_at        timestamptz,
  p_note           text     DEFAULT NULL,
  p_lock_entries   boolean  DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_batch_id   uuid := gen_random_uuid();
  v_item       jsonb;
  v_owner      uuid;
  v_result     jsonb;
  v_all        jsonb := '[]'::jsonb;
  v_count      integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'create_worker_payout_batch: unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'create_worker_payout_batch: p_items must be non-empty array' USING ERRCODE = '22023';
  END IF;
  IF p_payment_source IS NULL OR length(p_payment_source) = 0 THEN
    RAISE EXCEPTION 'create_worker_payout_batch: payment_source required' USING ERRCODE = '22023';
  END IF;

  -- Pre-flight: every project owned by caller.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT user_id INTO v_owner
      FROM public.projects
     WHERE id = (v_item->>'project_id')::uuid;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'create_worker_payout_batch: project not found (%)', v_item->>'project_id'
        USING ERRCODE = 'P0002';
    END IF;
    IF v_owner <> v_caller THEN
      RAISE EXCEPTION 'create_worker_payout_batch: not owner of all projects' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Execute each item via existing create_worker_payout (reuses guards & segments).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_result := public.create_worker_payout(
      (v_item->>'worker_id')::uuid,
      (v_item->>'project_id')::uuid,
      (v_item->>'period_start')::date,
      (v_item->>'period_end')::date,
      (v_item->>'paid_amount')::numeric,
      p_payment_source,
      p_paid_at,
      p_note,
      p_lock_entries
    );

    UPDATE public.project_worker_payouts
       SET batch_id = v_batch_id
     WHERE id = (v_result->>'payout_id')::uuid;

    v_all := v_all || jsonb_build_array(v_result);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id',      v_batch_id,
    'payouts',       v_all,
    'payouts_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_worker_payout_batch(jsonb,text,timestamptz,text,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_worker_payout_batch(jsonb,text,timestamptz,text,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_worker_payout_batch(jsonb,text,timestamptz,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_worker_payout_batch(jsonb,text,timestamptz,text,boolean) TO service_role;

-- 3) RPC: void_worker_payout_batch (cascade)
CREATE OR REPLACE FUNCTION public.void_worker_payout_batch(
  p_batch_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_pid    uuid;
  v_count  integer := 0;
  v_owner_ok boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'void_worker_payout_batch: unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Ensure caller owns every project in batch (defense-in-depth; void_worker_payout also checks).
  SELECT bool_and(p.user_id = v_caller) INTO v_owner_ok
  FROM public.project_worker_payouts pw
  JOIN public.projects p ON p.id = pw.project_id
  WHERE pw.batch_id = p_batch_id;

  IF v_owner_ok IS NULL THEN
    RAISE EXCEPTION 'void_worker_payout_batch: batch not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner_ok IS FALSE THEN
    RAISE EXCEPTION 'void_worker_payout_batch: not owner of all projects' USING ERRCODE = '42501';
  END IF;

  FOR v_pid IN
    SELECT id FROM public.project_worker_payouts
     WHERE batch_id = p_batch_id AND status <> 'voided'
  LOOP
    PERFORM public.void_worker_payout(v_pid, p_reason);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'voided_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.void_worker_payout_batch(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_worker_payout_batch(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_worker_payout_batch(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_worker_payout_batch(uuid,text) TO service_role;