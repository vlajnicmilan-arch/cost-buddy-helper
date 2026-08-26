-- Ljudi: novčana mjera duga + redak namirenja za dug bez pokrića u slobodnim satima.
-- Polazi od žive definicije public.create_person_payout (pg_get_functiondef).
-- create_worker_payout, void_worker_payout i void_worker_payout_batch ostaju netaknuti.
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
  v_amount     numeric(12,2);
  v_earned     numeric(12,2);
  v_paid       numeric(12,2);
  v_debt       numeric(12,2);
  v_free       numeric(12,2);
  v_regular    numeric(12,2);
  v_settle     numeric(12,2);
  v_left       numeric(12,2);
  v_take       numeric(12,2);
  v_short      RECORD;
  v_fallback   numeric(10,2);
  v_name       text;
  v_first_proj uuid;
  v_result     jsonb;
  v_all        jsonb := '[]'::jsonb;
  v_count      integer := 0;
  v_payout_ids uuid[] := ARRAY[]::uuid[];
  v_plan       jsonb := '[]'::jsonb;
  v_settles    jsonb;
  v_settle_row jsonb;
  v_rows       integer := 0;
  v_payout_id  uuid;
  v_snapshot   numeric(10,2);
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

  -- FAZA 1: provjera i plan. Nijedan upis se ne događa prije nego sve stavke prođu.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT user_id INTO v_owner FROM public.projects WHERE id = (v_item->>'project_id')::uuid;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'create_person_payout: project not found (%)', v_item->>'project_id' USING ERRCODE = 'P0002';
    END IF;
    IF v_owner <> v_caller THEN
      RAISE EXCEPTION 'create_person_payout: not owner of all projects' USING ERRCODE = '42501';
    END IF;

    v_amount := ROUND((v_item->>'paid_amount')::numeric, 2);
    IF v_amount <= 0 THEN
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

    -- Dug se mjeri NOVCEM: sve zarađeno na angažmanu minus sve stvarno isplaćeno.
    SELECT ROUND(COALESCE(SUM(actual_hours * COALESCE(public.rate_at(worker_id, work_date), v_fallback)), 0), 2)
      INTO v_earned
      FROM public.project_work_entries
     WHERE worker_id = (v_item->>'worker_id')::uuid
       AND project_id = (v_item->>'project_id')::uuid;

    SELECT ROUND(COALESCE(SUM(paid_amount), 0), 2)
      INTO v_paid
      FROM public.project_worker_payouts
     WHERE worker_id = (v_item->>'worker_id')::uuid
       AND project_id = (v_item->>'project_id')::uuid
       AND status <> 'voided'
       AND voided_at IS NULL
       AND deleted_at IS NULL;

    v_debt := GREATEST(ROUND(v_earned - v_paid, 2), 0);

    IF v_amount > v_debt + 0.01 THEN
      RAISE EXCEPTION 'create_person_payout: payout_exceeds_remaining (engagement=%, max=%)',
        v_item->>'worker_id', v_debt USING ERRCODE = '22023';
    END IF;

    -- Slobodni sati služe SAMO za redovni put (period + zaključavanje).
    SELECT ROUND(COALESCE(SUM(actual_hours * COALESCE(public.rate_at(worker_id, work_date), v_fallback)), 0), 2)
      INTO v_free
      FROM public.project_work_entries
     WHERE worker_id = (v_item->>'worker_id')::uuid
       AND project_id = (v_item->>'project_id')::uuid
       AND work_date BETWEEN (v_item->>'period_start')::date AND (v_item->>'period_end')::date
       AND payout_id IS NULL;

    v_regular := LEAST(v_amount, v_free);
    IF v_regular < 0 THEN
      v_regular := 0;
    END IF;
    v_settle := ROUND(v_amount - v_regular, 2);

    -- Nepokriveni dio ide na razdoblja starih nedoplaćenih isplata (najstarija prva).
    v_settles := '[]'::jsonb;
    v_left := v_settle;
    IF v_left > 0 THEN
      FOR v_short IN
        SELECT period_start, period_end, ROUND(gross_amount - paid_amount, 2) AS shortfall
          FROM public.project_worker_payouts
         WHERE worker_id = (v_item->>'worker_id')::uuid
           AND project_id = (v_item->>'project_id')::uuid
           AND status <> 'voided'
           AND voided_at IS NULL
           AND deleted_at IS NULL
           AND ROUND(gross_amount - paid_amount, 2) > 0
         ORDER BY paid_at, id
      LOOP
        EXIT WHEN v_left <= 0;
        v_take := LEAST(v_left, v_short.shortfall);
        IF v_take > 0 THEN
          v_settles := v_settles || jsonb_build_array(jsonb_build_object(
            'period_start', v_short.period_start,
            'period_end',   v_short.period_end,
            'amount',       v_take
          ));
          v_left := ROUND(v_left - v_take, 2);
        END IF;
      END LOOP;

      IF v_left > 0 THEN
        v_settles := v_settles || jsonb_build_array(jsonb_build_object(
          'period_start', (v_item->>'period_start')::date,
          'period_end',   (v_item->>'period_end')::date,
          'amount',       v_left
        ));
      END IF;
    END IF;

    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'project_id',   v_item->>'project_id',
      'worker_id',    v_item->>'worker_id',
      'period_start', v_item->>'period_start',
      'period_end',   v_item->>'period_end',
      'regular',      v_regular,
      'settlements',  v_settles
    ));

    v_rows := v_rows + (CASE WHEN v_regular > 0 THEN 1 ELSE 0 END) + jsonb_array_length(v_settles);
    v_total := ROUND(v_total + v_amount, 2);
    IF v_first_proj IS NULL THEN
      v_first_proj := (v_item->>'project_id')::uuid;
    END IF;
  END LOOP;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'create_person_payout: nothing to pay' USING ERRCODE = '22023';
  END IF;

  -- FAZA 2A: jedan jedini redak → postojeći jednostruki put (vlastiti trošak).
  IF v_rows = 1 THEN
    v_item := v_plan->0;

    IF (v_item->>'regular')::numeric > 0 THEN
      v_result := public.create_worker_payout(
        (v_item->>'worker_id')::uuid,
        (v_item->>'project_id')::uuid,
        (v_item->>'period_start')::date,
        (v_item->>'period_end')::date,
        (v_item->>'regular')::numeric,
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

    -- Namirenje starog duga: 0 sati, gross = paid, status 'paid', vlastiti trošak.
    v_settle_row := (v_item->'settlements')->0;
    v_amount     := (v_settle_row->>'amount')::numeric;
    v_expense_id := gen_random_uuid();
    v_payout_id  := gen_random_uuid();

    SELECT hourly_rate INTO v_snapshot
      FROM public.project_workers WHERE id = (v_item->>'worker_id')::uuid;

    PERFORM set_config('app.allow_payout_write', 'on', true);

    INSERT INTO public.expenses (
      id, user_id, type, amount, payment_source, project_id,
      date, event_at, time_confidence, user_edited_event_at,
      category, description, worker_payout_id
    ) VALUES (
      v_expense_id, v_caller, 'expense', v_amount, p_payment_source,
      (v_item->>'project_id')::uuid,
      p_paid_at, p_paid_at, 'C2', true,
      'other',
      COALESCE(p_note, 'Isplata: ' || v_name),
      NULL
    );

    INSERT INTO public.project_worker_payouts (
      id, project_id, worker_id, expense_id, period_start, period_end,
      hours_covered, hourly_rate_snapshot, gross_amount, paid_amount,
      payment_source, paid_at, note, status, created_by, batch_id
    ) VALUES (
      v_payout_id, (v_item->>'project_id')::uuid, (v_item->>'worker_id')::uuid, v_expense_id,
      (v_settle_row->>'period_start')::date, (v_settle_row->>'period_end')::date,
      0, COALESCE(v_snapshot, 0), v_amount, v_amount,
      p_payment_source, p_paid_at, p_note, 'paid', v_caller, NULL
    );

    UPDATE public.expenses SET worker_payout_id = v_payout_id WHERE id = v_expense_id;

    RETURN jsonb_build_object(
      'batch_id', NULL,
      'expense_id', v_expense_id,
      'payouts', jsonb_build_array(jsonb_build_object(
        'payout_id', v_payout_id,
        'expense_id', v_expense_id,
        'hours_covered', 0,
        'gross_amount', v_amount,
        'paid_amount', v_amount,
        'hourly_rate_snapshot', COALESCE(v_snapshot, 0),
        'status', 'paid',
        'entries_locked', 0,
        'settlement', true
      )),
      'payouts_count', 1,
      'total_paid', v_total
    );
  END IF;

  -- FAZA 2B: više redaka → JEDAN trošak i zajednički batch_id.
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    IF (v_item->>'regular')::numeric > 0 THEN
      v_result := public.create_worker_payout(
        (v_item->>'worker_id')::uuid,
        (v_item->>'project_id')::uuid,
        (v_item->>'period_start')::date,
        (v_item->>'period_end')::date,
        (v_item->>'regular')::numeric,
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
    END IF;

    SELECT hourly_rate INTO v_snapshot
      FROM public.project_workers WHERE id = (v_item->>'worker_id')::uuid;

    FOR v_settle_row IN SELECT * FROM jsonb_array_elements(v_item->'settlements') LOOP
      v_amount    := (v_settle_row->>'amount')::numeric;
      v_payout_id := gen_random_uuid();

      INSERT INTO public.project_worker_payouts (
        id, project_id, worker_id, expense_id, period_start, period_end,
        hours_covered, hourly_rate_snapshot, gross_amount, paid_amount,
        payment_source, paid_at, note, status, created_by, batch_id
      ) VALUES (
        v_payout_id, (v_item->>'project_id')::uuid, (v_item->>'worker_id')::uuid, v_expense_id,
        (v_settle_row->>'period_start')::date, (v_settle_row->>'period_end')::date,
        0, COALESCE(v_snapshot, 0), v_amount, v_amount,
        p_payment_source, p_paid_at, p_note, 'paid', v_caller, v_batch_id
      );

      v_payout_ids := v_payout_ids || v_payout_id;
      v_all := v_all || jsonb_build_array(jsonb_build_object(
        'payout_id', v_payout_id,
        'expense_id', v_expense_id,
        'hours_covered', 0,
        'gross_amount', v_amount,
        'paid_amount', v_amount,
        'hourly_rate_snapshot', COALESCE(v_snapshot, 0),
        'status', 'paid',
        'entries_locked', 0,
        'settlement', true
      ));
      v_count := v_count + 1;
    END LOOP;
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