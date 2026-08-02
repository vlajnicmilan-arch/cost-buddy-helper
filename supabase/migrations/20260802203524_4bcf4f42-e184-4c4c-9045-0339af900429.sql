CREATE TABLE public.incoming_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL,
  supplier_name text,
  supplier_oib text NOT NULL,
  invoice_number text NOT NULL,
  issue_date date,
  due_date date,
  total_amount numeric(14,2) NOT NULL,
  vat_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  iban text,
  doc_type text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprint text NOT NULL,
  paid_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  paid_at timestamptz,
  import_batch_id uuid,
  source_filename text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incoming_invoices_unique_number UNIQUE (user_id, supplier_oib, invoice_number),
  CONSTRAINT incoming_invoices_unique_fingerprint UNIQUE (user_id, fingerprint),
  CONSTRAINT incoming_invoices_currency_eur CHECK (currency = 'EUR'),
  CONSTRAINT incoming_invoices_doc_type CHECK (doc_type IN ('380','381','394'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incoming_invoices TO authenticated;
GRANT ALL ON public.incoming_invoices TO service_role;

ALTER TABLE public.incoming_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own incoming invoices"
  ON public.incoming_invoices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own incoming invoices"
  ON public.incoming_invoices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own incoming invoices"
  ON public.incoming_invoices FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own incoming invoices"
  ON public.incoming_invoices FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_incoming_invoices_user_created ON public.incoming_invoices (user_id, created_at DESC);
CREATE INDEX idx_incoming_invoices_batch ON public.incoming_invoices (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX idx_incoming_invoices_unpaid ON public.incoming_invoices (user_id, due_date) WHERE paid_expense_id IS NULL;

CREATE TRIGGER update_incoming_invoices_updated_at
  BEFORE UPDATE ON public.incoming_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();