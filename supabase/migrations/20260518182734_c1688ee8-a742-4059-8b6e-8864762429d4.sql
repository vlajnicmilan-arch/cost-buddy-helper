-- 1) Kolone
ALTER TABLE public.expenses           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.project_invoices   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.project_estimates  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Indexi
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_active           ON public.expenses (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_trash            ON public.expenses (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted_active           ON public.projects (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted_trash            ON public.projects (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_invoices_deleted_active   ON public.project_invoices (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_invoices_deleted_trash    ON public.project_invoices (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_estimates_deleted_active  ON public.project_estimates (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_estimates_deleted_trash   ON public.project_estimates (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_milestones_deleted_active ON public.project_milestones (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_milestones_deleted_trash  ON public.project_milestones (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3) Restriktivna RLS — globalno sakriva soft-deleted iz SVIH SELECT-a
DROP POLICY IF EXISTS "hide_soft_deleted" ON public.expenses;
CREATE POLICY "hide_soft_deleted" ON public.expenses
  AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "hide_soft_deleted" ON public.projects;
CREATE POLICY "hide_soft_deleted" ON public.projects
  AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "hide_soft_deleted" ON public.project_invoices;
CREATE POLICY "hide_soft_deleted" ON public.project_invoices
  AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "hide_soft_deleted" ON public.project_estimates;
CREATE POLICY "hide_soft_deleted" ON public.project_estimates
  AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "hide_soft_deleted" ON public.project_milestones;
CREATE POLICY "hide_soft_deleted" ON public.project_milestones
  AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);

-- 4) Cascade trigger za projekte (expenses, invoices, milestones)
CREATE OR REPLACE FUNCTION public.cascade_project_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.expenses           SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by WHERE project_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.project_invoices   SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by WHERE project_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.project_milestones SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by WHERE project_id = NEW.id AND deleted_at IS NULL;
  END IF;

  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    UPDATE public.expenses           SET deleted_at = NULL, deleted_by = NULL WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
    UPDATE public.project_invoices   SET deleted_at = NULL, deleted_by = NULL WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
    UPDATE public.project_milestones SET deleted_at = NULL, deleted_by = NULL WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_project_soft_delete ON public.projects;
CREATE TRIGGER trg_cascade_project_soft_delete
AFTER UPDATE OF deleted_at ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.cascade_project_soft_delete();

-- 5) RPC: list_trash (filter po user_id direktno)
CREATE OR REPLACE FUNCTION public.list_trash()
RETURNS TABLE(
  entity_type TEXT,
  id UUID,
  title TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleter_name TEXT,
  project_id UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'expense'::TEXT, e.id, COALESCE(NULLIF(e.description,''), e.category, 'Transakcija')::TEXT,
         e.deleted_at, e.deleted_by,
         (SELECT p.display_name FROM profiles p WHERE p.user_id = e.deleted_by),
         e.project_id
  FROM public.expenses e
  WHERE e.user_id = v_uid AND e.deleted_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = e.project_id AND pr.deleted_at = e.deleted_at)

  UNION ALL
  SELECT 'project'::TEXT, pr.id, pr.name::TEXT,
         pr.deleted_at, pr.deleted_by,
         (SELECT p.display_name FROM profiles p WHERE p.user_id = pr.deleted_by),
         NULL::UUID
  FROM public.projects pr
  WHERE pr.user_id = v_uid AND pr.deleted_at IS NOT NULL

  UNION ALL
  SELECT 'invoice'::TEXT, pi.id, COALESCE(pi.invoice_number, 'Faktura')::TEXT,
         pi.deleted_at, pi.deleted_by,
         (SELECT p.display_name FROM profiles p WHERE p.user_id = pi.deleted_by),
         pi.project_id
  FROM public.project_invoices pi
  WHERE pi.user_id = v_uid AND pi.deleted_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = pi.project_id AND pr.deleted_at = pi.deleted_at)

  UNION ALL
  SELECT 'estimate'::TEXT, pe.id, COALESCE(pe.estimate_number, 'Ponuda')::TEXT,
         pe.deleted_at, pe.deleted_by,
         (SELECT p.display_name FROM profiles p WHERE p.user_id = pe.deleted_by),
         pe.accepted_project_id
  FROM public.project_estimates pe
  WHERE pe.user_id = v_uid AND pe.deleted_at IS NOT NULL

  ORDER BY 4 DESC;
END;
$$;

-- 6) restore_trash_item
CREATE OR REPLACE FUNCTION public.restore_trash_item(p_entity TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ok BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF p_entity = 'expense' THEN
    SELECT EXISTS(SELECT 1 FROM expenses WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    UPDATE expenses SET deleted_at = NULL, deleted_by = NULL WHERE id = p_id;

  ELSIF p_entity = 'project' THEN
    SELECT EXISTS(SELECT 1 FROM projects WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    UPDATE projects SET deleted_at = NULL, deleted_by = NULL WHERE id = p_id;

  ELSIF p_entity = 'invoice' THEN
    SELECT EXISTS(SELECT 1 FROM project_invoices WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    UPDATE project_invoices SET deleted_at = NULL, deleted_by = NULL WHERE id = p_id;

  ELSIF p_entity = 'estimate' THEN
    SELECT EXISTS(SELECT 1 FROM project_estimates WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    UPDATE project_estimates SET deleted_at = NULL, deleted_by = NULL WHERE id = p_id;

  ELSE RAISE EXCEPTION 'unknown_entity: %', p_entity;
  END IF;
END;
$$;

-- 7) purge_trash_item
CREATE OR REPLACE FUNCTION public.purge_trash_item(p_entity TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_ok BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF p_entity = 'expense' THEN
    SELECT EXISTS(SELECT 1 FROM expenses WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    DELETE FROM expenses WHERE id = p_id;
  ELSIF p_entity = 'project' THEN
    SELECT EXISTS(SELECT 1 FROM projects WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    DELETE FROM projects WHERE id = p_id;
  ELSIF p_entity = 'invoice' THEN
    SELECT EXISTS(SELECT 1 FROM project_invoices WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    DELETE FROM project_invoices WHERE id = p_id;
  ELSIF p_entity = 'estimate' THEN
    SELECT EXISTS(SELECT 1 FROM project_estimates WHERE id = p_id AND user_id = v_uid AND deleted_at IS NOT NULL) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'not_found'; END IF;
    DELETE FROM project_estimates WHERE id = p_id;
  ELSE RAISE EXCEPTION 'unknown_entity: %', p_entity;
  END IF;
END;
$$;

-- 8) purge_old_trash
CREATE OR REPLACE FUNCTION public.purge_old_trash(p_older_than_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - (p_older_than_days || ' days')::INTERVAL;
  n_exp INT; n_inv INT; n_est INT; n_ms INT; n_pr INT;
BEGIN
  DELETE FROM expenses           WHERE deleted_at IS NOT NULL AND deleted_at < cutoff; GET DIAGNOSTICS n_exp = ROW_COUNT;
  DELETE FROM project_invoices   WHERE deleted_at IS NOT NULL AND deleted_at < cutoff; GET DIAGNOSTICS n_inv = ROW_COUNT;
  DELETE FROM project_estimates  WHERE deleted_at IS NOT NULL AND deleted_at < cutoff; GET DIAGNOSTICS n_est = ROW_COUNT;
  DELETE FROM project_milestones WHERE deleted_at IS NOT NULL AND deleted_at < cutoff; GET DIAGNOSTICS n_ms  = ROW_COUNT;
  DELETE FROM projects           WHERE deleted_at IS NOT NULL AND deleted_at < cutoff; GET DIAGNOSTICS n_pr  = ROW_COUNT;
  RETURN jsonb_build_object('cutoff', cutoff, 'expenses', n_exp, 'invoices', n_inv, 'estimates', n_est, 'milestones', n_ms, 'projects', n_pr, 'total', n_exp + n_inv + n_est + n_ms + n_pr);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_trash() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_trash_item(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_trash_item(TEXT, UUID) TO authenticated;