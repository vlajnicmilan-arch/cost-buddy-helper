-- Create installment plans table
CREATE TABLE public.installment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  installment_count INTEGER NOT NULL,
  first_payment_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  payment_source TEXT,
  payment_source_card_id UUID REFERENCES public.payment_source_cards(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create individual installments table
CREATE TABLE public.installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  installment_number INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'paid')),
  paid_at TIMESTAMP WITH TIME ZONE,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

-- RLS policies for installment_plans
CREATE POLICY "Users can view their own installment plans"
  ON public.installment_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own installment plans"
  ON public.installment_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own installment plans"
  ON public.installment_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own installment plans"
  ON public.installment_plans FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for installments
CREATE POLICY "Users can view their own installments"
  ON public.installments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own installments"
  ON public.installments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own installments"
  ON public.installments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own installments"
  ON public.installments FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_installment_plans_user_id ON public.installment_plans(user_id);
CREATE INDEX idx_installments_plan_id ON public.installments(plan_id);
CREATE INDEX idx_installments_user_id ON public.installments(user_id);
CREATE INDEX idx_installments_due_date ON public.installments(due_date);
CREATE INDEX idx_installments_status ON public.installments(status);

-- Trigger for updated_at
CREATE TRIGGER update_installment_plans_updated_at
  BEFORE UPDATE ON public.installment_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_installments_updated_at
  BEFORE UPDATE ON public.installments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();