DROP POLICY "Project members can view collaborators" ON public.project_collaborators;
CREATE POLICY "Project members can view collaborators"
ON public.project_collaborators
FOR SELECT
USING (public.is_project_participant_active(project_id, auth.uid()));

DROP POLICY "Project members can view contract amendments" ON public.project_contract_amendments;
CREATE POLICY "Project members can view contract amendments"
ON public.project_contract_amendments
FOR SELECT
USING (public.is_project_participant_active(project_id, auth.uid()));