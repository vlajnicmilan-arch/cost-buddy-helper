ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS invoice_id uuid;
CREATE INDEX IF NOT EXISTS expenses_invoice_id_idx ON public.expenses (invoice_id) WHERE invoice_id IS NOT NULL;