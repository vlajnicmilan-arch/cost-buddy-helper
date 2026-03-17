
CREATE TABLE public.project_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  company_name TEXT,
  service_description TEXT NOT NULL,
  total_price NUMERIC NOT NULL DEFAULT 0,
  milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  contact_info TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view collaborators"
  ON public.project_collaborators FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project owners can create collaborators"
  ON public.project_collaborators FOR INSERT
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can update collaborators"
  ON public.project_collaborators FOR UPDATE
  USING (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can delete collaborators"
  ON public.project_collaborators FOR DELETE
  USING (public.is_project_owner(project_id, auth.uid()));
