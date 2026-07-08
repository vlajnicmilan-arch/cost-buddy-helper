
-- =====================================================================
-- WS1 — Točnost financija
--   1.2  preview_worker_earnings RPC (rate_at, SECURITY DEFINER, revoke anon)
--   1.3  contract_value baseline lock (guard trigger na projects)
-- =====================================================================

-- =====================================================================
-- 1.2  preview_worker_earnings
--
-- Vraća historijski točan (per-day rate_at) preview zarade radnika u
-- zadanom periodu. Fallback na project_workers.hourly_rate za dane bez
-- rate_history retka (isti obrazac kao create_worker_payout).
--
-- Autorizacija: caller mora biti ili owner projekta ili linked worker.
-- (SELECT RLS na project_worker_rate_history bi ionako filtrirao, ali
--  budući da funkcija čita više tablica, radimo eksplicitnu provjeru
--  prije bilo kakvog čitanja.)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.preview_worker_earnings(
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
  v_caller       uuid := auth.uid();
  v_owner_id     uuid;
  v_worker_user  uuid;
  v_fallback     numeric;
  v_hours        numeric;
  v_gross        numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'preview_worker_earnings: unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'preview_worker_earnings: invalid period' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_owner_id FROM public.projects WHERE id = p_project_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'preview_worker_earnings: project not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT user_id, hourly_rate
    INTO v_worker_user, v_fallback
    FROM public.project_workers
   WHERE id = p_worker_id AND project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview_worker_earnings: worker not in project' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner_id <> v_caller
     AND (v_worker_user IS NULL OR v_worker_user <> v_caller) THEN
    RAISE EXCEPTION 'preview_worker_earnings: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(SUM(actual_hours), 0),
    COALESCE(SUM(actual_hours * COALESCE(public.rate_at(worker_id, work_date), v_fallback)), 0)
    INTO v_hours, v_gross
    FROM public.project_work_entries
   WHERE worker_id  = p_worker_id
     AND project_id = p_project_id
     AND work_date BETWEEN p_period_start AND p_period_end;

  RETURN jsonb_build_object(
    'hours',       v_hours,
    'gross',       ROUND(v_gross, 2),
    'period_start', p_period_start,
    'period_end',   p_period_end
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.preview_worker_earnings(uuid, uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_worker_earnings(uuid, uuid, date, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.preview_worker_earnings(uuid, uuid, date, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.preview_worker_earnings(uuid, uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.preview_worker_earnings(uuid, uuid, date, date) IS
  'WS1/1.2 — historijski točan preview zarade radnika (per-day rate_at, fallback worker.hourly_rate). Owner ili linked worker.';


-- =====================================================================
-- 1.3  Contract value baseline lock
--
-- Blokira izmjenu projects.contract_value kada projekt ima barem jedan
-- redak u project_contract_amendments. Bypass flag prati postojeći
-- obrazac (`app.allow_*_write='on'`) za buduće admin/service kanale.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._guard_contract_value_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allow text := current_setting('app.allow_contract_baseline_write', true);
  v_has   boolean;
BEGIN
  -- Insert / delete: nema što štititi.
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Bypass za service_role / admin RPC (postavlja set_config prije UPDATE).
  IF v_allow = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_value IS DISTINCT FROM OLD.contract_value THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_contract_amendments
       WHERE project_id = OLD.id
    ) INTO v_has;

    IF v_has THEN
      RAISE EXCEPTION
        'projects.contract_value: baseline zaključan — postoje aneksi ugovora. Ukloni aneksе ili dodaj novi umjesto izmjene baseline vrijednosti.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_contract_value_update ON public.projects;
CREATE TRIGGER trg_guard_contract_value_update
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public._guard_contract_value_update();

COMMENT ON FUNCTION public._guard_contract_value_update() IS
  'WS1/1.3 — Blokira izmjenu projects.contract_value kada postoje aneksi. Bypass: SET LOCAL app.allow_contract_baseline_write=on.';
