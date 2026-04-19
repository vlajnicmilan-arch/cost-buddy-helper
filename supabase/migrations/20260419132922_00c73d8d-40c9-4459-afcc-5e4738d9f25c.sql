ALTER TABLE public.business_debts 
ADD COLUMN IF NOT EXISTS source_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_debts_source_expense_id 
ON public.business_debts(source_expense_id);