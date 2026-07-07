
CREATE OR REPLACE FUNCTION public.enqueue_worker_payout_notifications(
  p_payout_ids uuid[],
  p_action     text,
  p_actor      uuid,
  p_batch_id   uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivered integer := 0;
  v_rec RECORD;
  v_project_names text[];
  v_project_ids uuid[];
  v_payout_ids uuid[];
  v_total numeric;
  v_amount_fmt text;
  v_title text;
  v_message text;
  v_period_start date;
  v_period_end date;
  v_single_project text;
  v_row_count integer;
BEGIN
  IF p_payout_ids IS NULL OR array_length(p_payout_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    SELECT w.user_id AS recipient
    FROM public.project_worker_payouts pw
    JOIN public.project_workers w ON w.id = pw.worker_id
    WHERE pw.id = ANY(p_payout_ids)
      AND w.user_id IS NOT NULL
      AND (p_actor IS NULL OR w.user_id <> p_actor)
    GROUP BY w.user_id
  LOOP
    SELECT
      array_agg(DISTINCT p.name),
      array_agg(DISTINCT pw.project_id),
      array_agg(pw.id),
      SUM(pw.paid_amount),
      MIN(pw.period_start),
      MAX(pw.period_end),
      COUNT(*)
    INTO
      v_project_names, v_project_ids, v_payout_ids, v_total, v_period_start, v_period_end, v_row_count
    FROM public.project_worker_payouts pw
    JOIN public.project_workers w ON w.id = pw.worker_id
    JOIN public.projects p ON p.id = pw.project_id
    WHERE pw.id = ANY(p_payout_ids)
      AND w.user_id = v_rec.recipient;

    v_amount_fmt := to_char(COALESCE(v_total,0), 'FM999G999G990D00') || ' EUR';
    v_single_project := CASE WHEN array_length(v_project_names,1) = 1 THEN v_project_names[1] ELSE NULL END;

    IF p_action = 'created' THEN
      IF v_row_count = 1 THEN
        v_title   := 'Nova isplata — ' || COALESCE(v_single_project,'projekt');
        v_message := 'Zaprimljena isplata ' || v_amount_fmt || ' za period ' || v_period_start || ' → ' || v_period_end || '.';
      ELSE
        v_title   := 'Zbirna isplata — ' || array_length(v_project_names,1) || ' projekta';
        v_message := 'Zaprimljeno ' || v_amount_fmt || ' za ' || array_length(v_project_names,1)
                  || ' projekata (' || array_to_string(v_project_names, ', ') || ').';
      END IF;
    ELSE
      IF v_row_count = 1 THEN
        v_title   := 'Isplata poništena — ' || COALESCE(v_single_project,'projekt');
        v_message := 'Vaša isplata ' || v_amount_fmt || ' (' || v_period_start || ' → ' || v_period_end || ') je poništena.';
      ELSE
        v_title   := 'Zbirna isplata poništena — ' || array_length(v_project_names,1) || ' projekta';
        v_message := 'Zbirna isplata ' || v_amount_fmt || ' za ' || array_length(v_project_names,1) || ' projekata je poništena.';
      END IF;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      v_rec.recipient,
      CASE WHEN p_action = 'created' THEN 'worker_payout_created' ELSE 'worker_payout_voided' END,
      v_title,
      v_message,
      jsonb_build_object(
        'batch_id', p_batch_id,
        'payout_ids', to_jsonb(v_payout_ids),
        'project_ids', to_jsonb(v_project_ids),
        'project_names', to_jsonb(v_project_names),
        'paid_amount_total', v_total,
        'action', p_action,
        'source', 'server'
      )
    );
    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN v_delivered;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_worker_payout_notify_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suppress text := current_setting('vmbalance.suppress_worker_payout_notify', true);
BEGIN
  IF v_suppress IS NOT NULL AND v_suppress = '1' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.enqueue_worker_payout_notifications(
      ARRAY[NEW.id]::uuid[],
      'created',
      auth.uid(),
      NEW.batch_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'trg_worker_payout_notify_insert failed: % %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_payout_notify_insert ON public.project_worker_payouts;
CREATE TRIGGER trg_worker_payout_notify_insert
  AFTER INSERT ON public.project_worker_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_worker_payout_notify_insert();

CREATE OR REPLACE FUNCTION public.trg_worker_payout_notify_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suppress text := current_setting('vmbalance.suppress_worker_payout_notify', true);
BEGIN
  IF v_suppress IS NOT NULL AND v_suppress = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'voided' AND (OLD.status IS DISTINCT FROM 'voided') THEN
    BEGIN
      PERFORM public.enqueue_worker_payout_notifications(
        ARRAY[NEW.id]::uuid[],
        'voided',
        auth.uid(),
        NEW.batch_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'trg_worker_payout_notify_void failed: % %', SQLERRM, SQLSTATE;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_payout_notify_void ON public.project_worker_payouts;
CREATE TRIGGER trg_worker_payout_notify_void
  AFTER UPDATE OF status ON public.project_worker_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_worker_payout_notify_void();

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
  v_payout_ids uuid[] := ARRAY[]::uuid[];
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

  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '1', true);

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

    v_payout_ids := v_payout_ids || (v_result->>'payout_id')::uuid;
    v_all := v_all || jsonb_build_array(v_result);
    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '0', true);
  PERFORM public.enqueue_worker_payout_notifications(v_payout_ids, 'created', v_caller, v_batch_id);

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
  v_payout_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'void_worker_payout_batch: unauthenticated' USING ERRCODE = '42501';
  END IF;

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

  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '1', true);

  FOR v_pid IN
    SELECT id FROM public.project_worker_payouts
     WHERE batch_id = p_batch_id AND status <> 'voided'
  LOOP
    PERFORM public.void_worker_payout(v_pid, p_reason);
    v_payout_ids := v_payout_ids || v_pid;
    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '0', true);
  IF array_length(v_payout_ids,1) IS NOT NULL THEN
    PERFORM public.enqueue_worker_payout_notifications(v_payout_ids, 'voided', v_caller, p_batch_id);
  END IF;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'voided_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.void_worker_payout_batch(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_worker_payout_batch(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_worker_payout_batch(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_worker_payout_batch(uuid,text) TO service_role;
