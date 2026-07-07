-- PR-A Worker Payouts (Faza A): tablice, kolone, triggeri, 4 RPC-a.
-- Scope: .lovable/plan.md sekcija 2.1–2.3. Izvan opsega: UI/hooks/push/CSV/RLS rewrite.

-- ============================================================
-- 1. Nova tablica: project_worker_payouts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_worker_payouts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  worker_id                   uuid NOT NULL REFERENCES public.project_workers(id) ON DELETE RESTRICT,
  expense_id                  uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  period_start                date NOT NULL,
  period_end                  date NOT NULL,
  hours_covered               numeric(10,2) NOT NULL DEFAULT 0,
  hourly_rate_snapshot        numeric(10,2) NOT NULL DEFAULT 0,
  gross_amount                numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount                 numeric(12,2) NOT NULL,
  payment_source              text,
  paid_at                     timestamptz NOT NULL,
  note                        text,
  status                      text NOT NULL DEFAULT 'paid'
                                CHECK (status IN ('paid','partial','advance','voided')),
  linked_advance_expense_ids  uuid[] NOT NULL DEFAULT '{}',
  voided_at                   timestamptz,
  voided_by                   uuid,
  void_reason                 text,
  created_by                  uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz,
  CONSTRAINT payout_period_valid CHECK (period_end >= period_start),
  CONSTRAINT payout_paid_amount_nonneg CHECK (paid_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_payouts_project      ON public.project_worker_payouts(project_id);
CREATE INDEX IF NOT EXISTS idx_payouts_worker       ON public.project_worker_payouts(worker_id);
CREATE INDEX IF NOT EXISTS idx_payouts_expense      ON public.project_worker_payouts(expense_id);
CREATE INDEX IF NOT EXISTS idx_payouts_period       ON public.project_worker_payouts(worker_id, period_start, period_end);

GRANT SELECT ON public.project_worker_payouts TO authenticated;
GRANT ALL    ON public.project_worker_payouts TO service_role;

ALTER TABLE public.project_worker_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payouts_select_owner_or_own_worker"
  ON public.project_worker_payouts FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_workers w
      WHERE w.id = project_worker_payouts.worker_id
        AND w.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_project_worker_payouts_updated
  BEFORE UPDATE ON public.project_worker_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. Nova tablica: project_work_entry_locks (append-only audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_work_entry_locks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id       uuid NOT NULL REFERENCES public.project_work_entries(id) ON DELETE CASCADE,
  payout_id      uuid NOT NULL REFERENCES public.project_worker_payouts(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  worker_id      uuid NOT NULL REFERENCES public.project_workers(id) ON DELETE CASCADE,
  action         text NOT NULL CHECK (action IN ('locked','unlocked')),
  reason         text,
  actor_user_id  uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locks_entry   ON public.project_work_entry_locks(entry_id);
CREATE INDEX IF NOT EXISTS idx_locks_payout  ON public.project_work_entry_locks(payout_id);

GRANT SELECT ON public.project_work_entry_locks TO authenticated;
GRANT ALL    ON public.project_work_entry_locks TO service_role;

ALTER TABLE public.project_work_entry_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locks_select_owner_or_own_worker"
  ON public.project_work_entry_locks FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_workers w
      WHERE w.id = project_work_entry_locks.worker_id
        AND w.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. Nove kolone na postojećim tablicama
-- ============================================================
ALTER TABLE public.project_work_entries
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.project_worker_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_entries_payout ON public.project_work_entries(payout_id);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS worker_payout_id uuid REFERENCES public.project_worker_payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_worker_payout ON public.expenses(worker_payout_id);

-- ============================================================
-- 4. Guard triggeri
-- Bank matching whitelist: bank_transaction_id, bank_account_id, bank_match_status.
-- ============================================================

CREATE OR REPLACE FUNCTION public._guard_expense_payout_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allow text := current_setting('app.allow_payout_write', true);
BEGIN
  IF v_allow = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.worker_payout_id IS NOT NULL THEN
      RAISE EXCEPTION 'expenses: direct DELETE forbidden for payout-linked row (id=%). Use void_worker_payout RPC.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.worker_payout_id IS NOT NULL THEN
    IF NEW.amount           IS DISTINCT FROM OLD.amount
       OR NEW.payment_source IS DISTINCT FROM OLD.payment_source
       OR NEW.event_at       IS DISTINCT FROM OLD.event_at
       OR NEW.date           IS DISTINCT FROM OLD.date
       OR NEW.deleted_at     IS DISTINCT FROM OLD.deleted_at
       OR NEW.worker_payout_id IS DISTINCT FROM OLD.worker_payout_id
       OR NEW.type           IS DISTINCT FROM OLD.type
    THEN
      RAISE EXCEPTION 'expenses: field mutation forbidden for payout-linked row (id=%). Use void_worker_payout RPC.', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_expense_payout_write ON public.expenses;
CREATE TRIGGER trg_guard_expense_payout_write
  BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public._guard_expense_payout_write();

CREATE OR REPLACE FUNCTION public._guard_work_entry_payout_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allow text := current_setting('app.allow_payout_write', true);
BEGIN
  IF v_allow = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.payout_id IS NOT NULL THEN
      RAISE EXCEPTION 'project_work_entries: direct DELETE forbidden for locked entry (id=%). Use unlock_work_entry RPC.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.payout_id IS NOT NULL THEN
    IF NEW.actual_hours    IS DISTINCT FROM OLD.actual_hours
       OR NEW.scheduled_hours IS DISTINCT FROM OLD.scheduled_hours
       OR NEW.work_date    IS DISTINCT FROM OLD.work_date
       OR NEW.worker_id    IS DISTINCT FROM OLD.worker_id
       OR NEW.project_id   IS DISTINCT FROM OLD.project_id
       OR NEW.milestone_ids IS DISTINCT FROM OLD.milestone_ids
       OR NEW.note         IS DISTINCT FROM OLD.note
       OR NEW.payout_id    IS DISTINCT FROM OLD.payout_id
    THEN
      RAISE EXCEPTION 'project_work_entries: mutation forbidden for locked entry (id=%). Use unlock_work_entry / update_locked_work_entry RPC.', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_work_entry_payout_write ON public.project_work_entries;
CREATE TRIGGER trg_guard_work_entry_payout_write
  BEFORE UPDATE OR DELETE ON public.project_work_entries
  FOR EACH ROW EXECUTE FUNCTION public._guard_work_entry_payout_write();

-- ============================================================
-- 5. RPC: create_worker_payout
-- ============================================================
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

  INSERT INTO public.project_worker_payouts (
    id, project_id, worker_id, expense_id, period_start, period_end,
    hours_covered, hourly_rate_snapshot, gross_amount, paid_amount,
    payment_source, paid_at, note, status, created_by
  ) VALUES (
    v_payout_id, p_project_id, p_worker_id, v_expense_id, p_period_start, p_period_end,
    v_hours, v_rate, v_gross, p_paid_amount,
    p_payment_source, p_paid_at, p_note, v_status, v_caller
  );

  INSERT INTO public.expenses (
    id, user_id, type, amount, payment_source, project_id,
    date, event_at, time_confidence, user_edited_event_at,
    category, description, worker_payout_id
  ) VALUES (
    v_expense_id, v_caller, 'expense', p_paid_amount, p_payment_source, p_project_id,
    p_paid_at, p_paid_at, 'C2', true,
    'other',
    COALESCE(p_note, 'Isplata: ' || v_worker_name),
    v_payout_id
  );

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

-- ============================================================
-- 6. RPC: void_worker_payout
-- ============================================================
CREATE OR REPLACE FUNCTION public.void_worker_payout(
  p_payout_id uuid,
  p_reason    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_project_id uuid;
  v_worker_id  uuid;
  v_owner_id   uuid;
  v_expense_id uuid;
  v_unlocked   integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'void_worker_payout: unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT project_id, worker_id, expense_id
    INTO v_project_id, v_worker_id, v_expense_id
    FROM public.project_worker_payouts
    WHERE id = p_payout_id AND status <> 'voided'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_worker_payout: payout not found or already voided' USING ERRCODE = 'P0002';
  END IF;

  SELECT user_id INTO v_owner_id FROM public.projects WHERE id = v_project_id;
  IF v_owner_id <> v_caller THEN
    RAISE EXCEPTION 'void_worker_payout: not project owner' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_payout_write', 'on', true);

  WITH upd AS (
    UPDATE public.project_work_entries
       SET payout_id = NULL
     WHERE payout_id = p_payout_id
    RETURNING id
  )
  INSERT INTO public.project_work_entry_locks (
    entry_id, payout_id, project_id, worker_id, action, reason, actor_user_id
  )
  SELECT id, p_payout_id, v_project_id, v_worker_id, 'unlocked',
         COALESCE(p_reason, 'void_worker_payout'), v_caller
    FROM upd;
  GET DIAGNOSTICS v_unlocked = ROW_COUNT;

  IF v_expense_id IS NOT NULL THEN
    UPDATE public.expenses
       SET deleted_at = now()
     WHERE id = v_expense_id;
  END IF;

  UPDATE public.project_worker_payouts
     SET status      = 'voided',
         voided_at   = now(),
         voided_by   = v_caller,
         void_reason = p_reason
   WHERE id = p_payout_id;

  RETURN jsonb_build_object(
    'payout_id',        p_payout_id,
    'expense_id',       v_expense_id,
    'entries_unlocked', v_unlocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_worker_payout(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_worker_payout(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_worker_payout(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_worker_payout(uuid,text) TO service_role;

-- ============================================================
-- 7. RPC: unlock_work_entry
-- ============================================================
CREATE OR REPLACE FUNCTION public.unlock_work_entry(
  p_entry_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_project_id uuid;
  v_worker_id  uuid;
  v_payout_id  uuid;
  v_owner_id   uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unlock_work_entry: unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT project_id, worker_id, payout_id
    INTO v_project_id, v_worker_id, v_payout_id
    FROM public.project_work_entries
    WHERE id = p_entry_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unlock_work_entry: entry not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_payout_id IS NULL THEN
    RAISE EXCEPTION 'unlock_work_entry: entry not locked' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_owner_id FROM public.projects WHERE id = v_project_id;
  IF v_owner_id <> v_caller THEN
    RAISE EXCEPTION 'unlock_work_entry: not project owner' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_payout_write', 'on', true);

  UPDATE public.project_work_entries
     SET payout_id = NULL
   WHERE id = p_entry_id;

  INSERT INTO public.project_work_entry_locks (
    entry_id, payout_id, project_id, worker_id, action, reason, actor_user_id
  ) VALUES (
    p_entry_id, v_payout_id, v_project_id, v_worker_id, 'unlocked',
    COALESCE(p_reason, 'unlock_work_entry'), v_caller
  );

  RETURN jsonb_build_object('entry_id', p_entry_id, 'payout_id', v_payout_id);
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_work_entry(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlock_work_entry(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.unlock_work_entry(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_work_entry(uuid,text) TO service_role;

-- ============================================================
-- 8. RPC: update_locked_work_entry
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_locked_work_entry(
  p_entry_id     uuid,
  p_actual_hours numeric,
  p_note         text DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_project_id uuid;
  v_worker_id  uuid;
  v_payout_id  uuid;
  v_owner_id   uuid;
  v_old_hours  numeric(10,2);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'update_locked_work_entry: unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_actual_hours < 0 THEN
    RAISE EXCEPTION 'update_locked_work_entry: negative hours' USING ERRCODE = '22023';
  END IF;

  SELECT project_id, worker_id, payout_id, actual_hours
    INTO v_project_id, v_worker_id, v_payout_id, v_old_hours
    FROM public.project_work_entries
    WHERE id = p_entry_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_locked_work_entry: entry not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_payout_id IS NULL THEN
    RAISE EXCEPTION 'update_locked_work_entry: entry not locked' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_owner_id FROM public.projects WHERE id = v_project_id;
  IF v_owner_id <> v_caller THEN
    RAISE EXCEPTION 'update_locked_work_entry: not project owner' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_payout_write', 'on', true);

  UPDATE public.project_work_entries
     SET actual_hours = p_actual_hours,
         note         = COALESCE(p_note, note)
   WHERE id = p_entry_id;

  INSERT INTO public.project_work_entry_locks (
    entry_id, payout_id, project_id, worker_id, action, reason, actor_user_id
  ) VALUES (
    p_entry_id, v_payout_id, v_project_id, v_worker_id, 'unlocked',
    COALESCE(p_reason,
      format('update_locked_work_entry: hours %s->%s', v_old_hours, p_actual_hours)),
    v_caller
  );

  RETURN jsonb_build_object(
    'entry_id',   p_entry_id,
    'payout_id',  v_payout_id,
    'old_hours',  v_old_hours,
    'new_hours',  p_actual_hours
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_locked_work_entry(uuid,numeric,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_locked_work_entry(uuid,numeric,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_locked_work_entry(uuid,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_locked_work_entry(uuid,numeric,text,text) TO service_role;