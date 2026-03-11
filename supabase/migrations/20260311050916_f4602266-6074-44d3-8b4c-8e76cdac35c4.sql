
-- Clients table
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  oib text,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'Hrvatska',
  email text,
  phone text,
  contact_person text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own clients" ON public.clients FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  invoice_number text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text DEFAULT 'draft',
  total_amount numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own invoices" ON public.invoices FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Invoice items
CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  unit text DEFAULT 'kom',
  unit_price numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  vat_rate numeric DEFAULT 25,
  total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage invoice items" ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()));

-- Inventory items
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  sku text,
  category text,
  unit text DEFAULT 'kom',
  purchase_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  min_quantity numeric DEFAULT 0,
  current_quantity numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own inventory" ON public.inventory_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inventory movements
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'in' or 'out'
  quantity numeric NOT NULL,
  price numeric DEFAULT 0,
  note text,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage inventory movements" ON public.inventory_movements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = item_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = item_id AND i.user_id = auth.uid()));
