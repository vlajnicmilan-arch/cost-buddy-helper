ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS accounting_category text;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_accounting_category_check
  CHECK (accounting_category IS NULL OR accounting_category IN ('project', 'tool', 'fixed_asset'));