-- V1-B: worker rate history + per-day payout compute + payout_rate_segments.

-- ============================================================
-- 1. project_worker_rate_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_worker_rate_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id      uuid NOT NULL REFERENCES public.project_workers(id) ON DELETE CASCADE,
  rate           numeric(10,2) NOT NULL CHECK (rate >= 0),
  effective_from date NOT NULL,
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_rate_history_worker_date
  ON public.project_worker_rate_history (worker_id, effective_from DESC);

GRANT SELECT ON public.project_worker_rate_history TO authenticated;
GRANT ALL    ON public.project_worker_rate_history TO service_role;

ALTER TABLE public.project_worker_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_history_select_owner_or_own_worker"
  ON public.project_worker_rate_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_workers w
      JOIN public.projects p ON p.id = w.project_id
      WHERE w.id = project_worker_rate_history.worker_id
        AND (p.user_id = auth.uid() OR w.user_id = auth.uid())
    )
  );

-- Guard: direct writes forbidden unless app.allow_rate_write='on'
CREATE OR REPLACE FUNCTION public._guard_rate_history_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_allow text := current_setting('app.allow_rate_write', true);
BEGIN
  IF v_allow = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'project_worker_rate_history: direct write forbidden. Use set_worker_hourly_rate RPC.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_rate_history_write ON public.project_worker_rate_history;
CREATE TRIGGER trg_guard_rate_history_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.project_worker_rate_history
  FOR EACH ROW EXECUTE FUNCTION public._guard_rate_history_write();

-- ============================================================
-- 2. Backfill from existing project_workers
-- ============================================================
DO $$
BEGIN
  PERFORM set_config('app.allow_rate_write', 'on', true);
  INSERT INTO public.project_worker_rate_history (worker_id, rate, effective_from, created_by)
  SELECT pw.id, pw.hourly_rate, pw.created_at::date, p.user_id
  FROM public.project_workers pw
  JOIN public.projects p ON p.id = pw.project_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.project_worker_rate_history rh
    WHERE rh.worker_id = pw.id
  );
END $$;

-- ============================================================
-- 3. rate_at(worker_id, date) helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.rate_at(_worker_id uuid, _d date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rate
  FROM public.project_worker_rate_history
  WHERE worker_id = _worker_id AND effective_from <= _d
  ORDER BY effective_from DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.rate_at(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_at(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_at(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_at(uuid, date) TO service_role;

-- ============================================================
-- 4. Guard on project_workers.hourly_rate direct UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public._guard_worker_rate_direct_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_allow text := current_setting('app.allow_rate_write', true);
BEGIN
  IF v_allow = 'on' THEN RETURN NEW; END IF;
  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate THEN
    RAISE EXCEPTION 'project_workers.hourly_rate: direct UPDATE forbidden. Use set_worker_hourly_rate RPC.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_worker_rate_direct_update ON public.project_workers;
CREATE TRIGGER trg_guard_worker_rate_direct_update
  BEFORE UPDATE ON public.project_workers
  FOR EACH ROW EXECUTE FUNCTION public._guard_worker_rate_direct_update();

-- ============================================================
-- 5. RPC: set_worker_hourly_rate (with paid-period collision check)
--    Error format on collision:
--      MESSAGE = 'rate_change_collides_with_payout|<payout_id>|<earliest_allowed_date>'
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_worker_hourly_rate(
  p_worker_id      uuid,
  p_rate           numeric,
  p_effective_from date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_project_id uuid;
  v_owner_id uuid;
  v_conflict_payout uuid;
  v_conflict_end date;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_rate < 0 THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: rate negative' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: effective_from required' USING ERRCODE = '22023';
  END IF;

  SELECT project_id INTO v_project_id
    FROM public.project_workers WHERE id = p_worker_id FOR UPDATE;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: worker not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT user_id INTO v_owner_id FROM public.projects WHERE id = v_project_id;
  IF v_owner_id <> v_caller THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: not project owner' USING ERRCODE = '42501';
  END IF;

  -- Collision: latest non-voided payout for this worker whose period_end >= effective_from
  SELECT id, period_end INTO v_conflict_payout, v_conflict_end
  FROM public.project_worker_payouts
  WHERE worker_id = p_worker_id
    AND status <> 'voided'
    AND period_end >= p_effective_from
  ORDER BY period_end DESC
  LIMIT 1;

  IF v_conflict_payout IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format(
        'rate_change_collides_with_payout|%s|%s',
        v_conflict_payout::text,
        (v_conflict_end + 1)::text
      );
  END IF;

  PERFORM set_config('app.allow_rate_write', 'on', true);

  INSERT INTO public.project_worker_rate_history (worker_id, rate, effective_from, created_by)
  VALUES (p_worker_id, p_rate, p_effective_from, v_caller)
  ON CONFLICT (worker_id, effective_from) DO UPDATE
    SET rate = EXCLUDED.rate, created_by = EXCLUDED.created_by, created_at = now();

  UPDATE public.project_workers
     SET hourly_rate = public.rate_at(p_worker_id, CURRENT_DATE)
   WHERE id = p_worker_id;

  RETURN jsonb_build_object(
    'worker_id',      p_worker_id,
    'rate',           p_rate,
    'effective_from', p_effective_from,
    'current_rate',   public.rate_at(p_worker_id, CURRENT_DATE)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_worker_hourly_rate(uuid, numeric, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_worker_hourly_rate(uuid, numeric, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_worker_hourly_rate(uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_worker_hourly_rate(uuid, numeric, date) TO service_role;

-- ============================================================
-- 6. payout_rate_segments — permanent per-segment breakdown
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payout_rate_segments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id     uuid NOT NULL REFERENCES public.project_worker_payouts(id) ON DELETE CASCADE,
  rate          numeric(10,2) NOT NULL,
  segment_start date NOT NULL,
  segment_end   date NOT NULL,
  hours         numeric(10,2) NOT NULL,
  subtotal      numeric(12,2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segments_period_valid CHECK (segment_end >= segment_start),
  CONSTRAINT segments_hours_nonneg CHECK (hours >= 0)
);

CREATE INDEX IF NOT EXISTS idx_segments_payout ON public.payout_rate_segments(payout_id);

GRANT SELECT ON public.payout_rate_segments TO authenticated;
GRANT ALL    ON public.payout_rate_segments TO service_role;

ALTER TABLE public.payout_rate_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segments_select_owner_or_own_worker"
  ON public.payout_rate_segments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_worker_payouts p
      WHERE p.id = payout_rate_segments.payout_id
        AND (
          public.is_project_owner(p.project_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.project_workers w
            WHERE w.id = p.worker_id AND w.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- 7. Rewrite create_worker_payout: per-day compute + segments
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
  v_hours        numeric(10,2) := 0;
  v_gross        numeric(12,2) := 0;
  v_snapshot     numeric(10,2);
  v_status       text;
  v_payout_id    uuid := gen_random_uuid();
  v_expense_id   uuid := gen_random_uuid();
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

  -- Per-day hours + gross using rate_at (fallback to worker.hourly_rate if no history match)
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

  INSERT INTO public.project_worker_payouts (
    id, project_id, worker_id, expense_id, period_start, period_end,
    hours_covered, hourly_rate_snapshot, gross_amount, paid_amount,
    payment_source, paid_at, note, status, created_by
  ) VALUES (
    v_payout_id, p_project_id, p_worker_id, v_expense_id, p_period_start, p_period_end,
    v_hours, v_snapshot, v_gross, p_paid_amount,
    p_payment_source, p_paid_at, p_note, v_status, v_caller
  );

  UPDATE public.expenses SET worker_payout_id = v_payout_id WHERE id = v_expense_id;

  -- Segments (one row per distinct rate)
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
$$;

REVOKE ALL ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean) TO service_role;

-- ============================================================
-- 8. preview_worker_payout — dry-run breakdown for UI
-- ============================================================
CREATE OR REPLACE FUNCTION public.preview_worker_payout(
  p_worker_id    uuid,
  p_project_id   uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
  v_hours  numeric(10,2) := 0;
  v_gross  numeric(12,2) := 0;
  v_fallback numeric(10,2);
  v_segments jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'preview_worker_payout: unauthenticated' USING ERRCODE = '42501';
  END IF;
  SELECT user_id INTO v_owner FROM public.projects WHERE id = p_project_id;
  IF v_owner IS NULL OR v_owner <> v_caller THEN
    RAISE EXCEPTION 'preview_worker_payout: not project owner' USING ERRCODE = '42501';
  END IF;

  SELECT hourly_rate INTO v_fallback FROM public.project_workers WHERE id = p_worker_id;

  SELECT COALESCE(jsonb_agg(row_to_json(seg) ORDER BY seg.mind), '[]'::jsonb),
         COALESCE(SUM(seg.hh), 0),
         COALESCE(SUM(seg.hh * seg.rate), 0)
  INTO v_segments, v_hours, v_gross
  FROM (
    SELECT
      COALESCE(public.rate_at(worker_id, work_date), v_fallback) AS rate,
      MIN(work_date) AS mind,
      MAX(work_date) AS maxd,
      SUM(actual_hours) AS hh
    FROM public.project_work_entries
    WHERE worker_id = p_worker_id
      AND project_id = p_project_id
      AND work_date BETWEEN p_period_start AND p_period_end
      AND payout_id IS NULL
    GROUP BY COALESCE(public.rate_at(worker_id, work_date), v_fallback)
  ) seg;

  RETURN jsonb_build_object(
    'hours',    v_hours,
    'gross',    ROUND(v_gross, 2),
    'segments', v_segments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_worker_payout(uuid,uuid,date,date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_worker_payout(uuid,uuid,date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_worker_payout(uuid,uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_worker_payout(uuid,uuid,date,date) TO service_role;