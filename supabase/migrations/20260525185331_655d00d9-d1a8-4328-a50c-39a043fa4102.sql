
ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- Backfill: existing completed milestones get actual_end_date from completed_at
UPDATE public.project_milestones
   SET actual_end_date = completed_at::date
 WHERE status = 'completed'
   AND completed_at IS NOT NULL
   AND actual_end_date IS NULL;
