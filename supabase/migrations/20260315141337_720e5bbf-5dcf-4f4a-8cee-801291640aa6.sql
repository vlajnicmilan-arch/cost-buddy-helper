
-- Business premises (poslovni prostori)
CREATE TABLE public.business_premises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '1',
  label text,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'Hrvatska',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_premises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own premises"
ON public.business_premises FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Cash registers (blagajne)
CREATE TABLE public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  premise_id uuid NOT NULL REFERENCES public.business_premises(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '1',
  label text,
  device_type text DEFAULT 'mob',
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cash registers"
ON public.cash_registers FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add new fields to business_profiles
ALTER TABLE public.business_profiles
ADD COLUMN IF NOT EXISTS vat_obligation_type text DEFAULT 'non_vat',
ADD COLUMN IF NOT EXISTS vat_exemption_note text DEFAULT 'Obveznik nije u sustavu PDV-a, PDV nije obračunat temeljem čl. 90 st.1 Zakona o PDV-u.',
ADD COLUMN IF NOT EXISTS owner_name text,
ADD COLUMN IF NOT EXISTS invoice_payment_days integer DEFAULT 7,
ADD COLUMN IF NOT EXISTS invoice_header text,
ADD COLUMN IF NOT EXISTS invoice_footer text;
