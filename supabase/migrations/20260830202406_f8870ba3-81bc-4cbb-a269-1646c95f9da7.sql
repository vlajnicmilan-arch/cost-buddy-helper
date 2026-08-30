DROP POLICY "project_milestones_readonly_when_downgraded" ON public.project_milestones;

CREATE POLICY "project_milestones_readonly_when_downgraded_ins"
ON public.project_milestones
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (projects_downgrade_ok(project_id, auth.uid()));

CREATE POLICY "project_milestones_readonly_when_downgraded_upd"
ON public.project_milestones
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (projects_downgrade_ok(project_id, auth.uid()))
WITH CHECK (projects_downgrade_ok(project_id, auth.uid()));

CREATE POLICY "project_milestones_readonly_when_downgraded_del"
ON public.project_milestones
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (projects_downgrade_ok(project_id, auth.uid()));