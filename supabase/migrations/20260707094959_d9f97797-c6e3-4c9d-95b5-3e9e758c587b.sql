-- PR-A fix: reorder INSERTs u create_worker_payout tako da expense ide PRIJE payouta
-- (payout.expense_id FK referencira expenses.id koji tada već postoji).
-- Također linki expense.worker_payout_id nakon što je payout kreiran.
-- Guard flag app.allow_payout_write='on' je već postavljen prije ovih INSERT-a
-- u istoj funkciji, pa update expense-a prolazi kroz guard trigger.

CREATE OR REPLACE FUNCTION public.create_worker_payout(
  p_worker_id      uuid,
  p_project_id     uuid,
  p_period_start   date,
  p_period_end     date,
  p_paid_amount    numeric,
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
  v_caller       uuid := auth.uid();
  v_owner_id     uuid;
  v_rate         numeric(10,2);
  v_hours        numeric(10,2) := 0;
  v_gross        numeric(12,2) := 0;
  v_status       text;
  v_payout_id    uuid := gen_random_uuid();
  v_expense_id   uuid := gen_random_uuid();
  v_locked_count integer := 0;
  v_worker_name  text;
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

  SELECT hourly_rate, (first_name || ' ' || last_name)
    INTO v_rate, v_worker_name
    FROM public.project_workers
    WHERE id = p_worker_id AND project_id = p_project_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_worker_payout: worker not in project' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(actual_hours), 0)
    INTO v_hours
    FROM public.project_work_entries
    WHERE worker_id = p_worker_id
      AND project_id = p_project_id
      AND work_date BETWEEN p_period_start AND p_period_end
      AND payout_id IS NULL;

  v_gross := ROUND(v_hours * v_rate, 2);

  IF v_hours = 0 AND p_paid_amount > 0 THEN
    v_status := 'advance';
  ELSIF p_paid_amount >= v_gross THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  PERFORM set_config('app.allow_payout_write', 'on', true);

  -- 1) Prvo expense (bez linka na payout, payout još ne postoji)
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

  -- 2) Payout (expense_id FK je sad valjan)
  INSERT INTO public.project_worker_payouts (
    id, project_id, worker_id, expense_id, period_start, period_end,
    hours_covered, hourly_rate_snapshot, gross_amount, paid_amount,
    payment_source, paid_at, note, status, created_by
  ) VALUES (
    v_payout_id, p_project_id, p_worker_id, v_expense_id, p_period_start, p_period_end,
    v_hours, v_rate, v_gross, p_paid_amount,
    p_payment_source, p_paid_at, p_note, v_status, v_caller
  );

  -- 3) Naknadno linkaj expense.worker_payout_id
  UPDATE public.expenses
     SET worker_payout_id = v_payout_id
   WHERE id = v_expense_id;

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
    'status',         v_status,
    'entries_locked', v_locked_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) TO service_role;