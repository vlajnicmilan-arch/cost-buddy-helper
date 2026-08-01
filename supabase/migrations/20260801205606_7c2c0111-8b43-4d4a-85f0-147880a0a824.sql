
-- 1. Centralizirani predikat: tko smije mijenjati NAPREDAK projekta.
CREATE OR REPLACE FUNCTION public.can_write_project_progress(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.get_project_role(_project_id, _user_id) IN ('owner','member')
     AND public.projects_downgrade_ok(_project_id, _user_id);
$$;

REVOKE ALL ON FUNCTION public.can_write_project_progress(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_project_progress(uuid, uuid) TO authenticated, service_role;

-- 2. Column guard: voditelj ne smije dirati novčane / strukturne stupce faze.
CREATE OR REPLACE FUNCTION public.guard_milestone_column_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.get_project_role(COALESCE(NEW.project_id, OLD.project_id), auth.uid());

  -- NULL = nema app korisnika (service_role / cron / definer put) → bez provjere.
  IF v_role IS NULL OR v_role = 'owner' THEN
    RETURN NEW;
  END IF;

  IF NEW.budget             IS DISTINCT FROM OLD.budget
     OR NEW.investor_price  IS DISTINCT FROM OLD.investor_price
     OR NEW.is_vtr          IS DISTINCT FROM OLD.is_vtr
     OR NEW.is_contingency  IS DISTINCT FROM OLD.is_contingency
     OR NEW.source_decision_id IS DISTINCT FROM OLD.source_decision_id
     OR NEW.project_id      IS DISTINCT FROM OLD.project_id
  THEN
    RAISE EXCEPTION 'milestone_amount_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_milestone_column_writes ON public.project_milestones;
CREATE TRIGGER trg_guard_milestone_column_writes
BEFORE UPDATE ON public.project_milestones
FOR EACH ROW EXECUTE FUNCTION public.guard_milestone_column_writes();

-- 3. project_milestones — članska UPDATE grana (BEZ can_write_module).
DROP POLICY IF EXISTS "Managers can update milestone progress" ON public.project_milestones;
CREATE POLICY "Managers can update milestone progress"
ON public.project_milestones
FOR UPDATE
TO authenticated
USING (public.can_write_project_progress(project_id, auth.uid()))
WITH CHECK (public.can_write_project_progress(project_id, auth.uid()));

-- 4. Dokumenti — suziti s "bilo koji član" na owner|member.
DROP POLICY IF EXISTS "Members can insert project documents" ON public.project_documents;
CREATE POLICY "Owner or manager can insert project documents"
ON public.project_documents
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_write_project_progress(project_id, auth.uid())
  AND uploaded_by = auth.uid()
);

DROP POLICY IF EXISTS "Members can update project documents" ON public.project_documents;
CREATE POLICY "Owner or manager can update project documents"
ON public.project_documents
FOR UPDATE
TO authenticated
USING (public.can_write_project_progress(project_id, auth.uid()))
WITH CHECK (public.can_write_project_progress(project_id, auth.uid()));

-- 5. Kontrolne liste faza — isto suženje.
DROP POLICY IF EXISTS "members can insert checklist" ON public.milestone_checklist_items;
CREATE POLICY "owner or manager can insert checklist"
ON public.milestone_checklist_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = milestone_checklist_items.milestone_id
      AND public.can_write_project_progress(m.project_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "members can update checklist" ON public.milestone_checklist_items;
CREATE POLICY "owner or manager can update checklist"
ON public.milestone_checklist_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = milestone_checklist_items.milestone_id
      AND public.can_write_project_progress(m.project_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = milestone_checklist_items.milestone_id
      AND public.can_write_project_progress(m.project_id, auth.uid())
  )
);

-- 6. Revizije budžeta — novčani zapis, isključivo vlasnik.
DROP POLICY IF EXISTS "Project members can create revisions" ON public.project_budget_revisions;
CREATE POLICY "Project owners can create revisions"
ON public.project_budget_revisions
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_owner(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project members can insert milestone revisions" ON public.milestone_budget_revisions;
CREATE POLICY "Project owners can insert milestone revisions"
ON public.milestone_budget_revisions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  AND user_id = auth.uid()
);

-- 7. Aneksi ugovora — ukloniti mrtvu referencu na ulogu 'manager'.
DROP POLICY IF EXISTS "Project owners and managers can insert contract amendments" ON public.project_contract_amendments;
CREATE POLICY "Project owners can insert contract amendments"
ON public.project_contract_amendments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_project_owner(project_id, auth.uid())
);
