
-- Create family_shared_projects table
CREATE TABLE public.family_shared_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  added_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, project_id)
);

-- Enable RLS
ALTER TABLE public.family_shared_projects ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can view shared projects"
ON public.family_shared_projects
FOR SELECT
USING (is_family_member(group_id, auth.uid()));

CREATE POLICY "Owners can manage shared projects"
ON public.family_shared_projects
FOR INSERT
WITH CHECK (is_family_owner(group_id, auth.uid()));

CREATE POLICY "Owners can remove shared projects"
ON public.family_shared_projects
FOR DELETE
USING (is_family_owner(group_id, auth.uid()));
