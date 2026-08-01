-- Korak A: role-scoped read pogled nad fazama projekta.
-- Pogled je SECURITY DEFINER (default security_invoker=off) — sam replicira
-- row filtere iz RLS-a: soft-delete, participant, downgrade guard.
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
  AND public.is_project_participant_active(m.project_id, auth.uid())
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = m.project_id AND p.user_id = auth.uid()
    )
    OR public.is_projects_subscriber(auth.uid())
  );

REVOKE ALL ON public.project_milestones_scoped FROM PUBLIC;
REVOKE ALL ON public.project_milestones_scoped FROM anon;
GRANT SELECT ON public.project_milestones_scoped TO authenticated;
GRANT SELECT ON public.project_milestones_scoped TO service_role;

-- Izravno citanje tablice: samo vlasnik. Restriktivne politike
-- (hide_soft_deleted, project_milestones_readonly_when_downgraded) ostaju i dalje
-- na snazi i dodatno suzuju ovaj pristup.
DROP POLICY IF EXISTS "Project participants can view milestones" ON public.project_milestones;

CREATE POLICY "Project owners can view milestones"
ON public.project_milestones
FOR SELECT
TO authenticated
USING (public.is_project_owner(project_id, auth.uid()));

-- Zatvaranje rupe: radnik je dosad mogao pozvati investitorski RPC i dobiti
-- investor_price. Suzeno na vlasnika / viewera / investitora.
CREATE OR REPLACE FUNCTION public.get_investor_project_phases(_project_id uuid)
 RETURNS TABLE(id uuid, project_id uuid, name text, description text, status text, start_date date, due_date date, actual_start_date date, actual_end_date date, sort_order integer, investor_price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.id, m.project_id, m.name, m.description,
    m.status, m.start_date, m.due_date,
    m.actual_start_date, m.actual_end_date,
    m.sort_order, m.investor_price
  FROM public.project_milestones m
  WHERE m.project_id = _project_id
    AND m.deleted_at IS NULL
    AND public.get_project_role(_project_id, auth.uid()) IN ('owner', 'viewer', 'investor')
  ORDER BY m.sort_order NULLS LAST, m.due_date NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.get_investor_project_phases(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_investor_project_phases(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_investor_project_phases(uuid) TO authenticated;