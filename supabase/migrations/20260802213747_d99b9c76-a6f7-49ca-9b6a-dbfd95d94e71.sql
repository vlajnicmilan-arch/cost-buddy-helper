ALTER TABLE public.incoming_invoices
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in',
  ADD COLUMN IF NOT EXISTS counterparty_name text,
  ADD COLUMN IF NOT EXISTS counterparty_oib text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS settled_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.incoming_invoices
  ADD CONSTRAINT incoming_invoices_direction_valid CHECK (direction IN ('in','out'));

UPDATE public.incoming_invoices
   SET counterparty_name = COALESCE(counterparty_name, supplier_name),
       counterparty_oib  = COALESCE(counterparty_oib, supplier_oib)
 WHERE counterparty_oib IS NULL;

ALTER TABLE public.incoming_invoices DROP CONSTRAINT IF EXISTS incoming_invoices_unique_number;
ALTER TABLE public.incoming_invoices DROP CONSTRAINT IF EXISTS incoming_invoices_unique_fingerprint;
DROP INDEX IF EXISTS public.incoming_invoices_unique_number;
DROP INDEX IF EXISTS public.incoming_invoices_unique_fingerprint;

CREATE UNIQUE INDEX incoming_invoices_unique_number
  ON public.incoming_invoices (user_id, direction, supplier_oib, invoice_number);
CREATE UNIQUE INDEX incoming_invoices_unique_fingerprint
  ON public.incoming_invoices (user_id, direction, fingerprint);

CREATE INDEX IF NOT EXISTS idx_incoming_invoices_direction
  ON public.incoming_invoices (user_id, direction, due_date)
  WHERE paid_expense_id IS NULL;