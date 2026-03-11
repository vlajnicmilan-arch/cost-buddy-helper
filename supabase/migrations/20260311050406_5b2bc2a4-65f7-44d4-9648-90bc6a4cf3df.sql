
-- PDV fields on expenses
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS vat_rate numeric,
  ADD COLUMN IF NOT EXISTS vat_amount numeric;

-- Travel orders
CREATE TABLE public.travel_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  destination text NOT NULL,
  purpose text,
  vehicle text DEFAULT 'personal_car',
  km_start numeric DEFAULT 0,
  km_end numeric DEFAULT 0,
  km_rate numeric DEFAULT 0.40,
  daily_allowance_type text DEFAULT 'none',
  status text DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.travel_order_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_order_id uuid NOT NULL REFERENCES public.travel_orders(id) ON DELETE CASCADE,
  expense_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for travel_orders
ALTER TABLE public.travel_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own travel orders" ON public.travel_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own travel orders" ON public.travel_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own travel orders" ON public.travel_orders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own travel orders" ON public.travel_orders
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS for travel_order_expenses
ALTER TABLE public.travel_order_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage travel expenses" ON public.travel_order_expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.travel_orders t WHERE t.id = travel_order_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.travel_orders t WHERE t.id = travel_order_id AND t.user_id = auth.uid()));
