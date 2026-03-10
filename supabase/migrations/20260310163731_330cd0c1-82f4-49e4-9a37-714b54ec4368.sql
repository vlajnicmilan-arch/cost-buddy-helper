
CREATE TABLE public.business_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  oib TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Hrvatska',
  iban TEXT,
  bank_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  is_vat_payer BOOLEAN DEFAULT false,
  vat_id TEXT,
  activity_code TEXT,
  activity_description TEXT,
  mbs TEXT,
  court_registry TEXT,
  legal_form TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own business profile"
  ON public.business_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own business profile"
  ON public.business_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own business profile"
  ON public.business_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own business profile"
  ON public.business_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
