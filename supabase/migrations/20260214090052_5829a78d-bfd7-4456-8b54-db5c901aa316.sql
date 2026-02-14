
-- Recurring transactions templates
CREATE TABLE public.recurring_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense', -- expense, income, transfer
  category TEXT NOT NULL DEFAULT 'other',
  payment_source TEXT,
  payment_source_card_id UUID REFERENCES public.payment_source_cards(id) ON DELETE SET NULL,
  income_source_id UUID REFERENCES public.income_sources(id) ON DELETE SET NULL,
  merchant_name TEXT,
  note TEXT,
  -- Transfer fields
  transfer_to_source TEXT,
  -- Recurrence settings
  frequency TEXT NOT NULL DEFAULT 'monthly', -- daily, weekly, biweekly, monthly, yearly
  day_of_month INTEGER, -- 1-31 for monthly
  day_of_week INTEGER, -- 0-6 for weekly (0=Sunday)
  -- Tracking
  next_due_date DATE NOT NULL,
  last_generated_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own recurring transactions"
  ON public.recurring_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own recurring transactions"
  ON public.recurring_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recurring transactions"
  ON public.recurring_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recurring transactions"
  ON public.recurring_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_recurring_transactions_updated_at
  BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
