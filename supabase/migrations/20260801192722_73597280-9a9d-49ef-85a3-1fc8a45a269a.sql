-- Korak A dopuna 2+3: jedinstveni predikat + povlačenje privremenih ovlasti.

-- 1) Downgrade guard (vlasnik bez pretplate) — JEDNA definicija.
CREATE OR REPLACE FUNCTION public.projects_downgrade_ok(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR public.is_projects_subscriber(_user_id);
$$;

REVOKE ALL ON FUNCTION public.projects_downgrade_ok(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.projects_downgrade_ok(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.projects_downgrade_ok(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.projects_downgrade_ok(uuid, uuid) TO service_role;

-- 2) Predikat čitanja faza — koristi ga i pogled i (preko downgrade dijela) politika.
CREATE OR REPLACE FUNCTION public.can_read_project_phases(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_project_participant_active(_project_id, _user_id)
     AND public.projects_downgrade_ok(_project_id, _user_id);
$$;

REVOKE ALL ON FUNCTION public.can_read_project_phases(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_project_phases(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_project_phases(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_project_phases(uuid, uuid) TO service_role;

-- 3) Pogled više ne ponavlja pravila — poziva predikat.
CREATE OR REPLACE VIEW public.project_milestones_scoped
WITH (security_barrier = true) AS
SELECT
  m.id,
  m.project_id,
  m.name,
  m.description,
  m.status,
  m.start_date,
  m.due_date,
  m.completed_at,
  m.actual_start_date,
  m.actual_end_date,
  m.sort_order,
  m.color,
  m.depends_on_milestone_id,
  m.reminder_days_before,
  m.is_contingency,
  m.is_vtr,
  m.source_decision_id,
  m.deleted_at,
  m.created_at,
  m.updated_at,
  CASE
    WHEN public.get_project_role(m.project_id, auth.uid()) IN ('owner', 'viewer', 'member')
      THEN m.budget
    ELSE NULL
  END AS budget,
  CASE
    WHEN public.get_project_role(m.project_id, auth.uid()) IN ('owner', 'viewer', 'investor')
      THEN m.investor_price
    ELSE NULL
  END AS investor_price
FROM public.project_milestones m
WHERE m.deleted_at IS NULL
  AND public.can_read_project_phases(m.project_id, auth.uid());

REVOKE ALL ON public.project_milestones_scoped FROM PUBLIC;
REVOKE ALL ON public.project_milestones_scoped FROM anon;
GRANT SELECT ON public.project_milestones_scoped TO authenticated;
GRANT SELECT ON public.project_milestones_scoped TO service_role;

-- 4) Restriktivna politika koristi ISTU funkciju (drugi pozivatelj predikata).
DROP POLICY IF EXISTS "project_milestones_readonly_when_downgraded" ON public.project_milestones;
CREATE POLICY "project_milestones_readonly_when_downgraded"
ON public.project_milestones
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.projects_downgrade_ok(project_id, auth.uid()))
WITH CHECK (public.projects_downgrade_ok(project_id, auth.uid()));

-- 5) Povlačenje privremenih ovlasti danih samo radi verifikacije
--    (migracije 20260801191600 i 20260801191714). Nijedna od njih nema
--    stvarni razlog za ostanak — verifikacija se od sada radi e2e testovima
--    s pravim prijavama po ulogama.
REVOKE EXECUTE ON FUNCTION public.get_project_role(uuid, uuid) FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.is_project_participant_active(uuid, uuid) FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.is_projects_subscriber(uuid) FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.get_investor_project_phases(uuid) FROM supabase_read_only_user;