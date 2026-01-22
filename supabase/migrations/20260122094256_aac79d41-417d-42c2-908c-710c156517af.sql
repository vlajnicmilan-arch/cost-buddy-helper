-- Remove the foreign key constraint that's blocking transactions
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_income_source_id_fkey;