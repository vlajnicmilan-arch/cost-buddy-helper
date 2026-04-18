-- Add archived_at to projects for archiving
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON public.projects(archived_at) WHERE archived_at IS NULL;