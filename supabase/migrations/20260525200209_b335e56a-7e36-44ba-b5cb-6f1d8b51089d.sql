ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS is_vtr BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_project_milestones_is_vtr 
  ON public.project_milestones(project_id) WHERE is_vtr = true;