ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS needs_explanation boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_expenses_needs_explanation
  ON public.expenses (user_id, date DESC)
  WHERE needs_explanation AND deleted_at IS NULL;

-- Povezivanje s ulaznim računom JEST objašnjenje → oznaka se gasi.
CREATE OR REPLACE FUNCTION public._clear_needs_explanation_on_eracun_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'eracun_payment_links' THEN
    target := NEW.expense_id;
  ELSE
    target := NEW.paid_expense_id;
  END IF;

  IF target IS NOT NULL THEN
    UPDATE public.expenses
       SET needs_explanation = false
     WHERE id = target
       AND needs_explanation;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._clear_needs_explanation_on_eracun_link() FROM anon;

DROP TRIGGER IF EXISTS trg_epl_clear_needs_explanation ON public.eracun_payment_links;
CREATE TRIGGER trg_epl_clear_needs_explanation
AFTER INSERT OR UPDATE OF expense_id ON public.eracun_payment_links
FOR EACH ROW EXECUTE FUNCTION public._clear_needs_explanation_on_eracun_link();

DROP TRIGGER IF EXISTS trg_inv_clear_needs_explanation ON public.incoming_invoices;
CREATE TRIGGER trg_inv_clear_needs_explanation
AFTER INSERT OR UPDATE OF paid_expense_id ON public.incoming_invoices
FOR EACH ROW EXECUTE FUNCTION public._clear_needs_explanation_on_eracun_link();