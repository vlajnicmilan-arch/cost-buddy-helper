
CREATE TABLE public.business_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'receivable',
  contact_name text NOT NULL,
  description text,
  amount numeric NOT NULL,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own debts" ON public.business_debts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own debts" ON public.business_debts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own debts" ON public.business_debts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own debts" ON public.business_debts FOR DELETE TO authenticated USING (auth.uid() = user_id);
