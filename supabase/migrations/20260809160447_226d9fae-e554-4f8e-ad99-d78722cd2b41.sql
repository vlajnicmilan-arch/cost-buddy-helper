-- ============================================================================
-- POVEZIVANJE POSTOJEĆIH TROŠKOVA S ULAZNIM RAČUNIMA
--
-- TVRDO PRAVILO (uklesano): povezivanje NIKAD ne dira `expenses` nijednim
-- UPDATE-om, INSERT-om ni DELETE-om. Piše se isključivo u `incoming_invoices`
-- (settled_amount / paid_at / paid_expense_id) i u `eracun_payment_links`.
-- Svaki dodir `expenses` budi motor salda i sidra (triggeri
-- `_expenses_recompute_source_balance`, `_cps_*`) i tiho pomiče stanje računa
-- korisnika. Ne pretvarati ove funkcije u pisače u `expenses`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.eracun_recalc_invoice_on_link_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settled numeric;
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(l.amount), 0)
    INTO v_settled
    FROM public.eracun_payment_links l
   WHERE l.invoice_id = OLD.invoice_id;

  SELECT i.total_amount INTO v_total
    FROM public.incoming_invoices i
   WHERE i.id = OLD.invoice_id;

  IF v_total IS NULL THEN
    RETURN OLD; -- račun je već obrisan (CASCADE)
  END IF;

  UPDATE public.incoming_invoices i
     SET settled_amount = ROUND(v_settled, 2),
         paid_at = CASE WHEN v_settled + 0.005 >= v_total THEN i.paid_at ELSE NULL END,
         paid_expense_id = CASE
           WHEN i.paid_expense_id = OLD.expense_id AND v_settled + 0.005 < v_total THEN NULL
           ELSE i.paid_expense_id
         END,
         updated_at = now()
   WHERE i.id = OLD.invoice_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS eracun_payment_links_after_delete ON public.eracun_payment_links;
CREATE TRIGGER eracun_payment_links_after_delete
AFTER DELETE ON public.eracun_payment_links
FOR EACH ROW EXECUTE FUNCTION public.eracun_recalc_invoice_on_link_delete();

-- ----------------------------------------------------------------------------
-- Povezivanje postojećeg troška s ulaznim računom.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eracun_link_existing_expense(
  p_invoice_id uuid,
  p_expense_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.incoming_invoices%ROWTYPE;
  v_exp public.expenses%ROWTYPE;
  v_remaining numeric;
  v_used numeric;
  v_free numeric;
  v_amount numeric;
  v_settled numeric;
  v_covered boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_inv FROM public.incoming_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_inv.user_id <> v_uid THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'invoice_already_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_exp FROM public.expenses WHERE id = p_expense_id;
  IF NOT FOUND OR v_exp.user_id <> v_uid THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Isti kontekst (osobno = osobno, biznis profil = isti biznis profil).
  IF v_exp.business_profile_id IS DISTINCT FROM v_inv.business_profile_id THEN
    RAISE EXCEPTION 'context_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF v_exp.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'expense_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF v_exp.type <> 'expense' THEN
    RAISE EXCEPTION 'expense_wrong_type' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(v_exp.expense_nature, '') IN ('correction', 'transfer') THEN
    RAISE EXCEPTION 'expense_wrong_nature' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(v_exp.status, 'approved') <> 'approved' THEN
    RAISE EXCEPTION 'expense_not_counted' USING ERRCODE = 'P0001';
  END IF;

  -- Ista valuta — konverzija je izvan opsega.
  IF COALESCE(v_exp.currency, 'EUR') <> COALESCE(v_inv.currency, 'EUR') THEN
    RAISE EXCEPTION 'currency_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- Datum troška unutar ±90 dana od izdavanja računa.
  IF v_inv.issue_date IS NOT NULL
     AND ABS(v_exp.date::date - v_inv.issue_date) > 90 THEN
    RAISE EXCEPTION 'date_out_of_window' USING ERRCODE = 'P0001';
  END IF;

  v_remaining := ROUND(v_inv.total_amount - COALESCE(v_inv.settled_amount, 0), 2);
  IF v_remaining <= 0.005 THEN
    RAISE EXCEPTION 'invoice_fully_settled' USING ERRCODE = 'P0001';
  END IF;

  -- Brana „isti trošak potrošen dvaput": zbroj svih veza tog troška
  -- ne smije premašiti iznos troška.
  SELECT COALESCE(SUM(l.amount), 0) INTO v_used
    FROM public.eracun_payment_links l
   WHERE l.expense_id = p_expense_id;
  v_free := ROUND(ABS(v_exp.amount) - v_used, 2);
  IF v_free <= 0.005 THEN
    RAISE EXCEPTION 'expense_fully_allocated' USING ERRCODE = 'P0001';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, LEAST(v_remaining, v_free)), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'amount_not_positive' USING ERRCODE = 'P0001';
  END IF;
  IF v_amount > v_remaining + 0.005 THEN
    RAISE EXCEPTION 'amount_exceeds_invoice' USING ERRCODE = 'P0001';
  END IF;
  IF v_amount > v_free + 0.005 THEN
    RAISE EXCEPTION 'amount_exceeds_expense' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.eracun_payment_links (
    user_id, business_profile_id, invoice_id, expense_id, amount, matched_by
  ) VALUES (
    v_uid, v_inv.business_profile_id, p_invoice_id, p_expense_id, v_amount, 'manual_existing'
  );

  v_settled := ROUND(COALESCE(v_inv.settled_amount, 0) + v_amount, 2);
  v_covered := v_settled + 0.005 >= v_inv.total_amount;

  UPDATE public.incoming_invoices
     SET settled_amount = v_settled,
         paid_at = CASE WHEN v_covered THEN v_exp.date::timestamptz ELSE paid_at END,
         paid_expense_id = CASE WHEN v_covered THEN p_expense_id ELSE paid_expense_id END,
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'expense_id', p_expense_id,
    'amount', v_amount,
    'settled_amount', v_settled,
    'covered', v_covered
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Odvezivanje — brisanje veze; okidač iznad vraća pokrivenost računa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eracun_unlink_expense(
  p_invoice_id uuid,
  p_expense_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.eracun_payment_links
   WHERE invoice_id = p_invoice_id
     AND expense_id = p_expense_id
     AND user_id = v_uid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'expense_id', p_expense_id, 'unlinked', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.eracun_link_existing_expense(uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eracun_unlink_expense(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eracun_link_existing_expense(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eracun_unlink_expense(uuid, uuid) TO authenticated;