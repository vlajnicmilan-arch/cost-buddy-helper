-- Add note column to expenses table for project transaction notes
ALTER TABLE public.expenses ADD COLUMN note TEXT DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.expenses.note IS 'Optional note that can be added by project members to transactions';