-- ============================================================
-- Korak E — pending project expenses
-- ============================================================

-- 1. Columns -------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_rejection_reason_requires_rejected;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_rejection_reason_requires_rejected
  CHECK (rejection_reason IS NULL OR status = 'rejected'::transaction_status);

-- 2. Balance engine — pending/rejected are invisible ---------
CREATE OR REPLACE FUNCTION public._expenses_recompute_source_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_src uuid;
  v_new_src uuid;
  v_old_dst uuid;
  v_new_dst uuid;
  v_affected uuid[];
  v_id uuid;
  v_anchor_date timestamptz;
  v_delta numeric(12,2);
  v_old_sign numeric;
  v_new_sign numeric;
  v_old_amount numeric(12,2);
  v_new_amount numeric(12,2);
  v_old_is_correction boolean;
  v_new_is_correction boolean;
  v_old_deleted boolean;
  v_new_deleted boolean;
  v_old_counted boolean := false;
  v_new_counted boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_old_src := public._extract_custom_source_id(OLD.payment_source);
    v_old_dst := CASE WHEN OLD.type = 'transfer' THEN OLD.income_source_id ELSE NULL END;
    v_old_amount := OLD.amount;
    v_old_is_correction := COALESCE(OLD.expense_nature,'regular') = 'correction';
    v_old_deleted := OLD.deleted_at IS NOT NULL;
    -- Korak E: only approved rows ever touched the balance.
    v_old_counted := NOT v_old_deleted
                     AND NOT v_old_is_correction
                     AND COALESCE(OLD.status::text,'approved') = 'approved';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_new_src := public._extract_custom_source_id(NEW.payment_source);
    v_new_dst := CASE WHEN NEW.type = 'transfer' THEN NEW.income_source_id ELSE NULL END;
    v_new_amount := NEW.amount;
    v_new_is_correction := COALESCE(NEW.expense_nature,'regular') = 'correction';
    v_new_deleted := NEW.deleted_at IS NOT NULL;
    v_new_counted := NOT v_new_deleted
                     AND NOT v_new_is_correction
                     AND COALESCE(NEW.status::text,'approved') = 'approved';
  END IF;

  v_affected := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[v_old_src, v_new_src, v_old_dst, v_new_dst]) AS t(x)
    WHERE x IS NOT NULL
    ORDER BY x
  );

  FOREACH v_id IN ARRAY v_affected LOOP
    SELECT correction_anchor_date INTO v_anchor_date
      FROM public.custom_payment_sources WHERE id = v_id;

    IF v_anchor_date IS NOT NULL THEN
      PERFORM public.recompute_custom_source_balance(v_id);
    ELSE
      v_delta := 0;
      IF TG_OP IN ('UPDATE','DELETE') AND v_old_counted THEN
        v_old_sign := CASE
          WHEN OLD.type='income'   AND v_old_src = v_id THEN  1
          WHEN OLD.type='expense'  AND v_old_src = v_id THEN -1
          WHEN OLD.type='transfer' AND v_old_src = v_id THEN -1
          WHEN OLD.type='transfer' AND v_old_dst = v_id THEN  1
          ELSE 0
        END;
        v_delta := v_delta - (v_old_sign * v_old_amount);
      END IF;
      IF TG_OP IN ('INSERT','UPDATE') AND v_new_counted THEN
        v_new_sign := CASE
          WHEN NEW.type='income'   AND v_new_src = v_id THEN  1
          WHEN NEW.type='expense'  AND v_new_src = v_id THEN -1
          WHEN NEW.type='transfer' AND v_new_src = v_id THEN -1
          WHEN NEW.type='transfer' AND v_new_dst = v_id THEN  1
          ELSE 0
        END;
        v_delta := v_delta + (v_new_sign * v_new_amount);
      END IF;

      IF v_delta <> 0 THEN
        PERFORM set_config('app.balance_writer', 'engine', true);
        UPDATE public.custom_payment_sources
          SET balance = balance + v_delta,
              updated_at = now()
          WHERE id = v_id;
        PERFORM set_config('app.balance_writer', '', true);
      END IF;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_custom_source_balance(p_source_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anchor_date timestamptz;
  v_anchor_balance numeric(12,2);
  v_owner uuid;
  v_sum numeric(12,2) := 0;
  v_new_balance numeric(12,2);
  v_mode text;
BEGIN
  SELECT correction_anchor_date, correction_anchor_balance, user_id
    INTO v_anchor_date, v_anchor_balance, v_owner
    FROM public.custom_payment_sources
    WHERE id = p_source_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Unanchored: recompute je no-op (delta-put pokriva). Vraća NULL.
  IF v_anchor_date IS NULL OR v_anchor_balance IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(value #>> '{}', 'day_cut')
    INTO v_mode
    FROM public.app_settings
    WHERE key = 'anchor_engine_mode';
  IF v_mode IS NULL THEN v_mode := 'day_cut'; END IF;

  IF v_mode = 'hybrid' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND COALESCE(e.status::text,'approved') = 'approved'
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      )
      AND (
        (e.time_confidence IN ('C1','C2') AND e.event_at IS NOT NULL AND e.event_at > v_anchor_date)
        OR
        ((e.time_confidence IS NULL OR e.time_confidence IN ('C3','C4'))
          AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date)
      );
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN e.type='income'   AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN e.amount
        WHEN e.type='expense'  AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND public._extract_custom_source_id(e.payment_source)=p_source_id THEN -e.amount
        WHEN e.type='transfer' AND e.income_source_id=p_source_id THEN e.amount
        ELSE 0
      END
    ), 0)
    INTO v_sum
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.expense_nature,'regular') <> 'correction'
      AND COALESCE(e.status::text,'approved') = 'approved'
      AND (e.date AT TIME ZONE 'UTC')::date > (v_anchor_date AT TIME ZONE 'UTC')::date
      AND (
        public._extract_custom_source_id(e.payment_source) = p_source_id
        OR e.income_source_id = p_source_id
      );
  END IF;

  v_new_balance := v_anchor_balance + v_sum;

  PERFORM set_config('app.balance_writer', 'engine', true);
  UPDATE public.custom_payment_sources
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_source_id;
  PERFORM set_config('app.balance_writer', '', true);

  RETURN v_new_balance;
END;
$function$;

-- 3. INSERT policy refit -------------------------------------
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
CREATE POLICY "Users can create their own expenses"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN project_id IS NOT NULL THEN (
      auth.uid() = user_id
      AND (
        public.is_project_owner(project_id, auth.uid())
        OR (
          public.get_project_role(project_id, auth.uid()) = 'member'
          AND status = 'pending'::transaction_status
          AND submitted_by = auth.uid()
        )
      )
    )
    ELSE (
      (auth.uid() = user_id)
      OR ((income_source_id IS NOT NULL) AND public.is_income_source_member(income_source_id, auth.uid()))
    )
  END
);

-- 4. Review guard trigger (second lock) ----------------------
CREATE OR REPLACE FUNCTION public.guard_expense_review_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only project expenses are governed by the review workflow.
  IF NEW.project_id IS NULL AND OLD.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
  THEN
    IF COALESCE(current_setting('app.expense_reviewer', true), '') <> 'rpc' THEN
      RAISE EXCEPTION 'Review fields can only be changed through review_project_expense()'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_expense_review_writes ON public.expenses;
CREATE TRIGGER trg_guard_expense_review_writes
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_expense_review_writes();

-- 5. Dedicated review path -----------------------------------
CREATE OR REPLACE FUNCTION public.review_project_expense(
  p_expense_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
  v_status transaction_status;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023';
  END IF;

  SELECT project_id, status INTO v_project, v_status
    FROM public.expenses
   WHERE id = p_expense_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_project IS NULL THEN
    RAISE EXCEPTION 'Project expense not found' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_project_owner(v_project, v_uid) THEN
    RAISE EXCEPTION 'Only the project owner can review expenses' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'pending'::transaction_status THEN
    RAISE EXCEPTION 'Expense is not pending' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.expense_reviewer', 'rpc', true);
  UPDATE public.expenses
     SET status = CASE WHEN p_decision = 'approve'
                       THEN 'approved'::transaction_status
                       ELSE 'rejected'::transaction_status END,
         rejection_reason = CASE WHEN p_decision = 'reject' THEN NULLIF(p_reason, '') ELSE NULL END,
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_expense_id;
  PERFORM set_config('app.expense_reviewer', '', true);

  RETURN jsonb_build_object('id', p_expense_id, 'decision', p_decision);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.review_project_expense(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_project_expense(uuid, text, text) TO authenticated;

-- 6. Cron path: expire pending instead of deleting -----------
CREATE OR REPLACE FUNCTION public.auto_reject_expired_pending_expenses(p_older_than interval DEFAULT '24 hours')
RETURNS TABLE (id uuid, description text, submitted_by uuid, user_id uuid, project_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.expense_reviewer', 'rpc', true);

  RETURN QUERY
  UPDATE public.expenses e
     SET status = 'rejected'::transaction_status,
         rejection_reason = 'auto_reject_expired',
         reviewed_at = now()
   WHERE e.status = 'pending'::transaction_status
     AND e.created_at < now() - p_older_than
     AND e.deleted_at IS NULL
  RETURNING e.id, e.description, e.submitted_by, e.user_id, e.project_id;

  PERFORM set_config('app.expense_reviewer', '', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_reject_expired_pending_expenses(interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_reject_expired_pending_expenses(interval) TO service_role;

-- 7. Recompute balances for sources touched by non-approved rows
DO $do$
DECLARE
  v_count int;
  v_src uuid;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.expenses
   WHERE COALESCE(status::text,'approved') <> 'approved'
     AND deleted_at IS NULL;
  RAISE NOTICE 'Korak E: non-approved expenses found = %', v_count;

  FOR v_src IN
    SELECT DISTINCT s FROM (
      SELECT public._extract_custom_source_id(payment_source) AS s
        FROM public.expenses
       WHERE COALESCE(status::text,'approved') <> 'approved' AND deleted_at IS NULL
      UNION
      SELECT income_source_id AS s
        FROM public.expenses
       WHERE COALESCE(status::text,'approved') <> 'approved' AND deleted_at IS NULL
    ) q WHERE s IS NOT NULL
  LOOP
    PERFORM public.recompute_custom_source_balance(v_src);
  END LOOP;
END
$do$;