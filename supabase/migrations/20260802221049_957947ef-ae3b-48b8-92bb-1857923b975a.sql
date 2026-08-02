
ALTER TABLE public.expenses DROP COLUMN IF EXISTS invoice_id;

CREATE TABLE public.eracun_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_profile_id uuid,
  invoice_id uuid NOT NULL REFERENCES public.incoming_invoices(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  matched_by text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eracun_payment_links TO authenticated;
GRANT ALL ON public.eracun_payment_links TO service_role;

ALTER TABLE public.eracun_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own payment links"
  ON public.eracun_payment_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX eracun_payment_links_pair_uniq
  ON public.eracun_payment_links (invoice_id, expense_id);
CREATE INDEX eracun_payment_links_expense_idx
  ON public.eracun_payment_links (expense_id);
CREATE INDEX eracun_payment_links_user_idx
  ON public.eracun_payment_links (user_id);

CREATE TRIGGER update_eracun_payment_links_updated_at
  BEFORE UPDATE ON public.eracun_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.eracun_counterparty_iban (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_profile_id uuid,
  iban text NOT NULL,
  counterparty_oib text,
  counterparty_name text,
  confirmed_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eracun_counterparty_iban TO authenticated;
GRANT ALL ON public.eracun_counterparty_iban TO service_role;

ALTER TABLE public.eracun_counterparty_iban ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own learned ibans"
  ON public.eracun_counterparty_iban FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX eracun_counterparty_iban_uniq
  ON public.eracun_counterparty_iban (
    user_id,
    iban,
    COALESCE(business_profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TRIGGER update_eracun_counterparty_iban_updated_at
  BEFORE UPDATE ON public.eracun_counterparty_iban
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
