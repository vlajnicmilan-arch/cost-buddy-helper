ALTER TABLE public.project_milestones
  ALTER COLUMN budget DROP DEFAULT,
  ALTER COLUMN budget DROP NOT NULL;