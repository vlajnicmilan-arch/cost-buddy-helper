-- Add import_batch_id to track CSV import batches
ALTER TABLE public.expenses ADD COLUMN import_batch_id uuid DEFAULT NULL;

-- Add index for efficient batch lookups
CREATE INDEX idx_expenses_import_batch_id ON public.expenses (import_batch_id) WHERE import_batch_id IS NOT NULL;