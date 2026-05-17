-- Audit log for contract amendments (aneksi ugovora s klijentom)
CREATE TABLE public.project_contract_amendments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amendment_amount NUMERIC NOT NULL,
  note TEXT,
  linked_revision_id UUID REFERENCES public.milestone_budget_revisions(id) ON DELETE SET NULL,
  linked_milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pca_project ON public.project_contract_amendments(project_id);
CREATE INDEX idx_pca_revision ON public.project_contract_amendments(linked_revision_id);

ALTER TABLE public.project_contract_amendments ENABLE ROW LEVEL SECURITY;

-- Vidljivo svima koji su članovi projekta (owner ili member)
CREATE POLICY "Project members can view contract amendments"
ON public.project_contract_amendments
FOR SELECT
USING (public.is_project_member(project_id, auth.uid()));

-- Insert: samo vlasnik projekta ili manager
CREATE POLICY "Project owners and managers can insert contract amendments"
ON public.project_contract_amendments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.is_project_owner(project_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_contract_amendments.project_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'manager'
    )
  )
);

-- Delete: samo vlasnik (za eventualne ispravke)
CREATE POLICY "Project owners can delete contract amendments"
ON public.project_contract_amendments
FOR DELETE
USING (public.is_project_owner(project_id, auth.uid()));