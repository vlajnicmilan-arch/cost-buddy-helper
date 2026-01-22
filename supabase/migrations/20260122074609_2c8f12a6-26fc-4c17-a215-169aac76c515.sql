-- Add payment_source column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN payment_source TEXT DEFAULT 'cash';

-- Add a comment for clarity
COMMENT ON COLUMN public.expenses.payment_source IS 'Source of payment: cash, bank, revolut, aircash, etc.';