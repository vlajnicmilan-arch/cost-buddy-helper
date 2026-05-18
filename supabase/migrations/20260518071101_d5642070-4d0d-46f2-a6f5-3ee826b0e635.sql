
-- ============= Phase 2: Računi (interni tracker) =============
-- Tracker za izdane račune. NIJE fiskalni dokument, samo evidencija.
-- Plaćanja se evidentiraju kroz expenses (type='income') s vezom invoice_id.

CREATE TABLE public.project_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  invoice_number text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  estimate_id uuid REFERENCES public.project_estimates(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_oib text,
  client_address text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'issued',
  -- issued | partially_paid | paid | cancelled  (overdue se izračunava iz due_date)
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_invoices_business ON public.project_invoices(business_profile_id);
CREATE INDEX idx_project_invoices_project ON public.project_invoices(project_id);
CREATE INDEX idx_project_invoices_estimate ON public.project_invoices(estimate_id);
CREATE INDEX idx_project_invoices_user ON public.project_invoices(user_id);

ALTER TABLE public.project_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices"
  ON public.project_invoices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoices"
  ON public.project_invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices"
  ON public.project_invoices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices"
  ON public.project_invoices FOR DELETE
  USING (auth.uid() = user_id);

-- Validate items shape (reuse pattern from project_estimates)
CREATE OR REPLACE FUNCTION public.validate_invoice_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF NEW.items IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.items) <> 'array' THEN
    RAISE EXCEPTION 'project_invoices.items must be a JSON array, got %', jsonb_typeof(NEW.items);
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
  LOOP
    IF NOT (item ? 'description') OR jsonb_typeof(item->'description') <> 'string' THEN
      RAISE EXCEPTION 'invoice item missing description (text)';
    END IF;
    IF NOT (item ? 'quantity') OR jsonb_typeof(item->'quantity') NOT IN ('number') THEN
      RAISE EXCEPTION 'invoice item missing numeric quantity';
    END IF;
    IF NOT (item ? 'unit_price') OR jsonb_typeof(item->'unit_price') NOT IN ('number') THEN
      RAISE EXCEPTION 'invoice item missing numeric unit_price';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_project_invoices_items
  BEFORE INSERT OR UPDATE ON public.project_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_items();

CREATE TRIGGER update_project_invoices_updated_at
  BEFORE UPDATE ON public.project_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link payments to invoices: nullable column on expenses.
-- Income transakcije mogu se vezati na konkretan račun. Nema utjecaja na ostatak app-a.
ALTER TABLE public.expenses
  ADD COLUMN invoice_id uuid REFERENCES public.project_invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_expenses_invoice ON public.expenses(invoice_id) WHERE invoice_id IS NOT NULL;
