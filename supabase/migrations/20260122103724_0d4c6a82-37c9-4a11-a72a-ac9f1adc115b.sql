-- Drop the old check constraint and add a new one that includes 'transfer'
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_type_check;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_type_check 
  CHECK (type IN ('expense', 'income', 'transfer'));