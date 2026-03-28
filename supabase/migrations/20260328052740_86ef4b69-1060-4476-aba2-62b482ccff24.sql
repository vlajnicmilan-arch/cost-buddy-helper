
-- 1. Budget revision log table
CREATE TABLE public.project_budget_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  previous_amount NUMERIC NOT NULL,
  new_amount NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_budget_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view revisions"
ON public.project_budget_revisions FOR SELECT TO authenticated
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can create revisions"
ON public.project_budget_revisions FOR INSERT TO authenticated
WITH CHECK (is_project_member(project_id, auth.uid()));

-- 2. Milestone dependencies column
ALTER TABLE public.project_milestones 
  ADD COLUMN depends_on_milestone_id UUID 
  REFERENCES public.project_milestones(id) ON DELETE SET NULL;

-- 3. Milestone reminder days column
ALTER TABLE public.project_milestones 
  ADD COLUMN reminder_days_before INTEGER DEFAULT 3;
