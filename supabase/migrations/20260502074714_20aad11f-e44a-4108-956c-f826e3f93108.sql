ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS label_overrides jsonb;

COMMENT ON COLUMN public.projects.project_type IS
  'Locked at creation. Drives default tab labels and template suggestions. Allowed: general, construction_new, renovation, interior, it_software, marketing, education, beauty, hospitality_event, healthcare, retail_opening, manufacturing, private_event.';

COMMENT ON COLUMN public.projects.label_overrides IS
  'Optional per-project tab label overrides (e.g. {"milestones": "Custom name"}). Reserved for future "Customize project" UI; currently unused.';

CREATE INDEX IF NOT EXISTS idx_projects_project_type ON public.projects(project_type);