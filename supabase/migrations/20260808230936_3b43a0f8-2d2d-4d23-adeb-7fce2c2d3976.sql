DROP INDEX IF EXISTS public.incoming_invoices_unique_number;
DROP INDEX IF EXISTS public.incoming_invoices_unique_fingerprint;

CREATE UNIQUE INDEX incoming_invoices_unique_personal
  ON public.incoming_invoices (user_id, direction, supplier_oib, invoice_number, doc_type)
  WHERE business_profile_id IS NULL;

CREATE UNIQUE INDEX incoming_invoices_unique_business
  ON public.incoming_invoices (business_profile_id, direction, supplier_oib, invoice_number, doc_type)
  WHERE business_profile_id IS NOT NULL;

CREATE INDEX idx_incoming_invoices_fingerprint
  ON public.incoming_invoices (user_id, direction, fingerprint);