-- 1) Guard: štiti i plaćanja suradnicima (živa definicija + suradnička grana)
CREATE OR REPLACE FUNCTION public._guard_expense_payout_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allow text := current_setting('app.allow_payout_write', true);
  v_worker boolean;
  v_collab boolean;
BEGIN
  IF v_allow = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Ownership gate: guard SAMO ownerov auto-expense.
  -- Radnikov attribution nikad ne referencira own row iz project_worker_payouts.expense_id.
  v_worker := EXISTS (
    SELECT 1 FROM public.project_worker_payouts
     WHERE expense_id = OLD.id
  );
  v_collab := EXISTS (
    SELECT 1 FROM public.project_collaborator_payments
     WHERE expense_id = OLD.id
  );

  IF NOT v_worker AND NOT v_collab THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_worker THEN
      RAISE EXCEPTION 'expenses: direct DELETE forbidden for owner payout expense (id=%). Use void_worker_payout RPC.', OLD.id
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'expenses: direct DELETE forbidden for collaborator payment expense (id=%). Use void_collaborator_payment RPC.', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.amount           IS DISTINCT FROM OLD.amount
     OR NEW.payment_source IS DISTINCT FROM OLD.payment_source
     OR NEW.event_at       IS DISTINCT FROM OLD.event_at
     OR NEW.date           IS DISTINCT FROM OLD.date
     OR NEW.deleted_at     IS DISTINCT FROM OLD.deleted_at
     OR NEW.worker_payout_id IS DISTINCT FROM OLD.worker_payout_id
     OR NEW.type           IS DISTINCT FROM OLD.type
  THEN
    IF v_worker THEN
      RAISE EXCEPTION 'expenses: field mutation forbidden for owner payout expense (id=%). Use void_worker_payout RPC.', OLD.id
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'expenses: field mutation forbidden for collaborator payment expense (id=%). Use void_collaborator_payment RPC.', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) void_collaborator_payment: mora smjeti mijenjati vlastiti trošak (živa definicija + zastavica)
CREATE OR REPLACE FUNCTION public.void_collaborator_payment(p_payment_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_collab     uuid;
  v_project    uuid;
  v_expense_id uuid;
  v_owner      uuid;
  v_after      numeric(12,2);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'void_collaborator_payment: unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT collaborator_id, project_id, expense_id
    INTO v_collab, v_project, v_expense_id
    FROM public.project_collaborator_payments
   WHERE id = p_payment_id
     AND status <> 'voided'
     AND voided_at IS NULL
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_collaborator_payment: collab_payment_not_found_or_voided' USING ERRCODE = 'P0002';
  END IF;

  SELECT user_id INTO v_owner FROM public.projects WHERE id = v_project;
  IF v_owner IS NULL OR v_owner <> v_caller THEN
    RAISE EXCEPTION 'void_collaborator_payment: not project owner' USING ERRCODE = '42501';
  END IF;

  IF v_expense_id IS NOT NULL THEN
    PERFORM set_config('app.allow_payout_write', 'on', true);
    UPDATE public.expenses SET deleted_at = now() WHERE id = v_expense_id;
    PERFORM set_config('app.allow_payout_write', 'off', true);
  END IF;

  UPDATE public.project_collaborator_payments
     SET status      = 'voided',
         voided_at   = now(),
         void_reason = p_reason
   WHERE id = p_payment_id;

  v_after := public._recalc_collaborator_paid(v_collab);

  RETURN jsonb_build_object(
    'payment_id',        p_payment_id,
    'expense_id',        v_expense_id,
    'collaborator_id',   v_collab,
    'paid_amount_after', v_after
  );
END;
$function$;

-- 3) Čvrsta veza plaćanja i troška (bez tihog čišćenja: живих sirotana nema)
ALTER TABLE public.project_collaborator_payments
  ADD CONSTRAINT project_collaborator_payments_expense_id_fkey
  FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE RESTRICT;
