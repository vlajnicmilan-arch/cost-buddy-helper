DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;

-- Asymmetry is intentional:
-- direction='in'  -> marking paid CREATES an expense (paid_expense_id set) because the cost is real and not otherwise recorded.
-- direction='out' -> marking collected ONLY sets paid_at. It must NEVER create an expense/income record,
--                    because revenue enters the app through bank statement import. Creating it here too
--                    would book the same money twice. Do not "fix" this into symmetry.
ALTER TABLE public.incoming_invoices
  ADD CONSTRAINT incoming_invoices_out_no_expense
  CHECK (direction <> 'out' OR paid_expense_id IS NULL);

COMMENT ON COLUMN public.incoming_invoices.paid_expense_id IS
  'Only for direction=''in''. Outgoing invoices never link to an expense; collection is recorded via paid_at only (revenue comes from bank statement import).';
COMMENT ON COLUMN public.incoming_invoices.paid_at IS
  'direction=in: when the bill was paid (with paid_expense_id). direction=out: when the client payment was collected (no financial record created).';

CREATE INDEX IF NOT EXISTS idx_incoming_invoices_open_by_paid_at
  ON public.incoming_invoices (user_id, direction, due_date)
  WHERE paid_at IS NULL;