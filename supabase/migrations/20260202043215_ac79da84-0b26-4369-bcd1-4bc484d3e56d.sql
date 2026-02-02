-- Add budget_id column to expenses table for manual budget assignment
ALTER TABLE public.expenses ADD COLUMN budget_id UUID REFERENCES public.budget_plans(id) ON DELETE SET NULL;

-- Create index for faster budget filtering
CREATE INDEX idx_expenses_budget_id ON public.expenses(budget_id) WHERE budget_id IS NOT NULL;

-- Enable realtime for expenses if not already enabled (for budget updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;