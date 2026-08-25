-- 1) create_worker_payout: dopusti dijeljeni trošak i batch oznaku (start from live definition)
DROP FUNCTION IF EXISTS public.create_worker_payout(uuid, uuid, date, date, numeric, text, timestamptz, text, boolean);

CREATE OR REPLACE FUNCTION public.create_worker_payout(
  p_worker_id uuid,
  p_project_id uuid,
  p_period_start date,
  p_period_end date,
  p_paid_amount numeric,
  p_payment_source text,
  p_paid_at timestamp with time zone,
  p_note text DEFAULT NULL::text,
  p_lock_entries boolean DEFAULT true,
  p_expense_id uuid DEFAULT NULL::uuid,
  p_batch_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_owner_id     uuid;
  v_hours        numeric(10,2) := 0;
  v_gross        numeric(12,2) := 0;
  v_snapshot     numeric(10,2);
  v_status       text;
  v_payout_id    uuid := gen_random_uuid();
  v_expense_id   uuid := COALESCE(p_expense_id, gen_random_uuid());
  v_shared       boolean := p_expense_id IS NOT NULL;
  v_locked_count integer := 0;
  v_worker_name  text;
  v_fallback_rate numeric(10,2);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'create_worker_payout: unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'create_worker_payout: period_end < period_start' USING ERRCODE = '22023';
  END IF;
  IF p_paid_amount < 0 THEN
    RAISE EXCEPTION 'create_worker_payout: paid_amount negative' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_owner_id FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_worker_payout: project not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner_id <> v_caller THEN
    RAISE EXCEPTION 'create_worker_payout: not project owner' USING ERRCODE = '42501';
  END IF;

  SELECT (first_name || ' ' || last_name), hourly_rate
    INTO v_worker_name, v_fallback_rate
    FROM public.project_workers
    WHERE id = p_worker_id AND project_id = p_project_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_worker_payout: worker not in project' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(SUM(actual_hours), 0),
    COALESCE(SUM(actual_hours * COALESCE(public.rate_at(worker_id, work_date), v_fallback_rate)), 0)
    INTO v_hours, v_gross
    FROM public.project_work_entries
    WHERE worker_id = p_worker_id
      AND project_id = p_project_id
      AND work_date BETWEEN p_period_start AND p_period_end
      AND payout_id IS NULL;

  v_gross := ROUND(v_gross, 2);
  v_snapshot := CASE
    WHEN v_hours > 0 THEN ROUND(v_gross / v_hours, 2)
    ELSE v_fallback_rate
  END;

  IF v_hours = 0 AND p_paid_amount > 0 THEN
    v_status := 'advance';
  ELSIF p_paid_amount >= v_gross THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  PERFORM set_config('app.allow_payout_write', 'on', true);

  IF NOT v_shared THEN
    INSERT INTO public.expenses (
      id, user_id, type, amount, payment_source, project_id,
      date, event_at, time_confidence, user_edited_event_at,
      category, description, worker_payout_id
    ) VALUES (
      v_expense_id, v_caller, 'expense', p_paid_amount, p_payment_source, p_project_id,
      p_paid_at, p_paid_at, 'C2', true,
      'other',
      COALESCE(p_note, 'Isplata: ' || v_worker_name),
      NULL
    );
  END IF;

  INSERT INTO public.project_worker_payouts (
    id, project_id, worker_id, expense_id, period_start, period_end,
    hours_covered, hourly_rate_snapshot, gross_amount, paid_amount,
    payment_source, paid_at, note, status, created_by, batch_id
  ) VALUES (
    v_payout_id, p_project_id, p_worker_id, v_expense_id, p_period_start, p_period_end,
    v_hours, v_snapshot, v_gross, p_paid_amount,
    p_payment_source, p_paid_at, p_note, v_status, v_caller, p_batch_id
  );

  IF NOT v_shared THEN
    UPDATE public.expenses SET worker_payout_id = v_payout_id WHERE id = v_expense_id;
  END IF;

  IF v_hours > 0 THEN
    INSERT INTO public.payout_rate_segments (
      payout_id, rate, segment_start, segment_end, hours, subtotal
    )
    SELECT v_payout_id,
           seg.rate,
           seg.mind,
           seg.maxd,
           seg.hh,
           ROUND(seg.hh * seg.rate, 2)
    FROM (
      SELECT
        COALESCE(public.rate_at(worker_id, work_date), v_fallback_rate) AS rate,
        MIN(work_date) AS mind,
        MAX(work_date) AS maxd,
        SUM(actual_hours) AS hh
      FROM public.project_work_entries
      WHERE worker_id = p_worker_id
        AND project_id = p_project_id
        AND work_date BETWEEN p_period_start AND p_period_end
        AND payout_id IS NULL
      GROUP BY COALESCE(public.rate_at(worker_id, work_date), v_fallback_rate)
    ) seg;
  END IF;

  IF p_lock_entries AND v_hours > 0 THEN
    WITH upd AS (
      UPDATE public.project_work_entries
         SET payout_id = v_payout_id
       WHERE worker_id = p_worker_id
         AND project_id = p_project_id
         AND work_date BETWEEN p_period_start AND p_period_end
         AND payout_id IS NULL
      RETURNING id
    )
    INSERT INTO public.project_work_entry_locks (
      entry_id, payout_id, project_id, worker_id, action, reason, actor_user_id
    )
    SELECT id, v_payout_id, p_project_id, p_worker_id, 'locked', 'create_worker_payout', v_caller
      FROM upd;
    GET DIAGNOSTICS v_locked_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'payout_id',      v_payout_id,
    'expense_id',     v_expense_id,
    'hours_covered',  v_hours,
    'gross_amount',   v_gross,
    'paid_amount',    p_paid_amount,
    'hourly_rate_snapshot', v_snapshot,
    'status',         v_status,
    'entries_locked', v_locked_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_worker_payout(uuid, uuid, date, date, numeric, text, timestamptz, text, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_worker_payout(uuid, uuid, date, date, numeric, text, timestamptz, text, boolean, uuid, uuid) TO authenticated, service_role;

-- 2) Isplata s kartice čovjeka: jedan trošak, jedan redak po angažmanu
CREATE OR REPLACE FUNCTION public.create_person_payout(
  p_items jsonb,
  p_payment_source text,
  p_paid_at timestamp with time zone,
  p_note text DEFAULT NULL::text,
  p_lock_entries boolean DEFAULT true
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_item       jsonb;
  v_owner      uuid;
  v_batch_id   uuid;
  v_expense_id uuid;
  v_total      numeric(12,2) := 0;
  v_remaining  numeric(12,2);
  v_fallback   numeric(10,2);
  v_name       text;
  v_first_proj uuid;
  v_result     jsonb;
  v_all        jsonb := '[]'::jsonb;
  v_count      integer := 0;
  v_payout_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'create_person_payout: unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'create_person_payout: p_items must be non-empty array' USING ERRCODE = '22023';
  END IF;
  IF p_payment_source IS NULL OR length(p_payment_source) = 0 THEN
    RAISE EXCEPTION 'create_person_payout: payment_source required' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT user_id INTO v_owner FROM public.projects WHERE id = (v_item->>'project_id')::uuid;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'create_person_payout: project not found (%)', v_item->>'project_id' USING ERRCODE = 'P0002';
    END IF;
    IF v_owner <> v_caller THEN
      RAISE EXCEPTION 'create_person_payout: not owner of all projects' USING ERRCODE = '42501';
    END IF;

    IF (v_item->>'paid_amount')::numeric <= 0 THEN
      RAISE EXCEPTION 'create_person_payout: paid_amount must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT (first_name || ' ' || last_name), hourly_rate
      INTO v_name, v_fallback
      FROM public.project_workers
     WHERE id = (v_item->>'worker_id')::uuid
       AND project_id = (v_item->>'project_id')::uuid;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'create_person_payout: worker not in project' USING ERRCODE = 'P0002';
    END IF;

    SELECT ROUND(COALESCE(SUM(actual_hours * COALESCE(public.rate_at(worker_id, work_date), v_fallback)), 0), 2)
      INTO v_remaining
      FROM public.project_work_entries
     WHERE worker_id = (v_item->>'worker_id')::uuid
       AND project_id = (v_item->>'project_id')::uuid
       AND work_date BETWEEN (v_item->>'period_start')::date AND (v_item->>'period_end')::date
       AND payout_id IS NULL;

    IF (v_item->>'paid_amount')::numeric > v_remaining + 0.01 THEN
      RAISE EXCEPTION 'create_person_payout: payout_exceeds_remaining (engagement=%, max=%)',
        v_item->>'worker_id', v_remaining USING ERRCODE = '22023';
    END IF;

    v_total := v_total + (v_item->>'paid_amount')::numeric;
    IF v_first_proj IS NULL THEN
      v_first_proj := (v_item->>'project_id')::uuid;
    END IF;
  END LOOP;

  -- Jedan angažman: postojeći jednostruki put (vlastiti trošak)
  IF jsonb_array_length(p_items) = 1 THEN
    v_item := p_items->0;
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
    RETURN jsonb_build_object(
      'batch_id', NULL,
      'expense_id', v_result->>'expense_id',
      'payouts', jsonb_build_array(v_result),
      'payouts_count', 1,
      'total_paid', v_total
    );
  END IF;

  v_batch_id := gen_random_uuid();
  v_expense_id := gen_random_uuid();

  PERFORM set_config('app.allow_payout_write', 'on', true);
  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '1', true);

  INSERT INTO public.expenses (
    id, user_id, type, amount, payment_source, project_id,
    date, event_at, time_confidence, user_edited_event_at,
    category, description, worker_payout_batch_id
  ) VALUES (
    v_expense_id, v_caller, 'expense', v_total, p_payment_source, v_first_proj,
    p_paid_at, p_paid_at, 'C2', true,
    'other',
    COALESCE(p_note, 'Isplata: ' || v_name),
    v_batch_id
  );

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
      p_lock_entries,
      v_expense_id,
      v_batch_id
    );
    v_payout_ids := v_payout_ids || (v_result->>'payout_id')::uuid;
    v_all := v_all || jsonb_build_array(v_result);
    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('vmbalance.suppress_worker_payout_notify', '0', true);
  PERFORM public.enqueue_worker_payout_notifications(v_payout_ids, 'created', v_caller, v_batch_id);

  RETURN jsonb_build_object(
    'batch_id',      v_batch_id,
    'expense_id',    v_expense_id,
    'payouts',       v_all,
    'payouts_count', v_count,
    'total_paid',    v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_person_payout(jsonb, text, timestamptz, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_person_payout(jsonb, text, timestamptz, text, boolean) TO authenticated, service_role;