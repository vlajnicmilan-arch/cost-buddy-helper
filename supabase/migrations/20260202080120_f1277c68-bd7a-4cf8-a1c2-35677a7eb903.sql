-- Add default work schedule to workers
ALTER TABLE public.project_workers 
ADD COLUMN work_start_time TIME DEFAULT '08:00',
ADD COLUMN work_end_time TIME DEFAULT '16:00';

-- Create table for daily work entries
CREATE TABLE public.project_work_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.project_workers(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  scheduled_hours NUMERIC NOT NULL DEFAULT 8,
  actual_hours NUMERIC NOT NULL DEFAULT 8,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(worker_id, work_date)
);

-- Enable RLS
ALTER TABLE public.project_work_entries ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Project members can view work entries"
ON public.project_work_entries
FOR SELECT
USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can add work entries"
ON public.project_work_entries
FOR INSERT
WITH CHECK (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update work entries"
ON public.project_work_entries
FOR UPDATE
USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project owners can delete work entries"
ON public.project_work_entries
FOR DELETE
USING (public.is_project_owner(project_id, auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_project_work_entries_updated_at
BEFORE UPDATE ON public.project_work_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();