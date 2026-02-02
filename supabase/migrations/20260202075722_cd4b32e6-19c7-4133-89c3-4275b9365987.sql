-- Create table for worker records (evidencija radnika)
CREATE TABLE public.project_workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  position TEXT NOT NULL,
  work_hours NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_workers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Project owners can manage workers"
ON public.project_workers
FOR ALL
USING (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project members can view workers"
ON public.project_workers
FOR SELECT
USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can add workers"
ON public.project_workers
FOR INSERT
WITH CHECK (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update workers"
ON public.project_workers
FOR UPDATE
USING (public.is_project_member(project_id, auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_project_workers_updated_at
BEFORE UPDATE ON public.project_workers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();