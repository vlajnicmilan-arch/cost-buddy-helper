ALTER TABLE public.project_work_logs
  ADD COLUMN IF NOT EXISTS day_type TEXT NOT NULL DEFAULT 'work',
  ADD COLUMN IF NOT EXISTS clock_in_time TEXT,
  ADD COLUMN IF NOT EXISTS clock_out_time TEXT;

ALTER TABLE public.project_work_logs
  DROP CONSTRAINT IF EXISTS project_work_logs_day_type_check;

ALTER TABLE public.project_work_logs
  ADD CONSTRAINT project_work_logs_day_type_check
  CHECK (day_type IN ('work', 'weekend', 'vacation', 'sick', 'holiday'));