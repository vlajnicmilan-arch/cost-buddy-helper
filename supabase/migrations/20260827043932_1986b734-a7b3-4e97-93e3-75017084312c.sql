-- ---------------------------------------------------------------------------
-- Suradnici: stvarno plaćanje s tragom u knjigama.
-- Radnički put (create_worker_payout / create_person_payout / void_*) se NE dira.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_collaborator_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.project_collaborators(id) ON DELETE RESTRICT,
  project_id      uuid NOT NULL REFERENCES public.projects(id),
  user_id         uuid NOT NULL,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at         timestamptz NOT NULL,
  payment_source  text NOT NULL,
  note            text,
  expense_id      uuid,
  status          text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','voided')),
  void_reason     text,
  voided_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pcp_collaborator_idx ON public.project_collaborator_payments (collaborator_id);
CREATE INDEX IF NOT EXISTS pcp_project_idx      ON public.project_collaborator_payments (project_id);

GRANT SELECT ON public.project_collaborator_payments TO authenticated;
GRANT ALL    ON public.project_collaborator_payments TO service_role;

ALTER TABLE public.project_collaborator_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own collaborator payments" ON public.project_collaborator_payments;
CREATE POLICY "Owner reads own collaborator payments"
  ON public.project_collaborator_payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---- legacy paid amount ---------------------------------------------------
ALTER TABLE public.project_collaborators
  ADD COLUMN IF NOT EXISTS legacy_paid_amount numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.project_collaborators
   SET legacy_paid_amount = ROUND(COALESCE(paid_amount, 0), 2)
 WHERE legacy_paid_amount = 0;

-- ---- recompute helper -----------------------------------------------------
CREATE OR REPLACE FUNCTION public._recalc_collaborator_paid(p_collaborator_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_legacy numeric(12,2);
  v_live   numeric(12,2);
BEGIN
  SELECT ROUND(COALESCE(legacy_paid_amount, 0), 2) INTO v_legacy
    FROM public.project_collaborators WHERE id = p_collaborator_id;

  SELECT ROUND(COALESCE(SUM(amount), 0), 2) INTO v_live
    FROM public.project_collaborator_payments
   WHERE collaborator_id = p_collaborator_id
     AND status = 'paid'
     AND voided_at IS NULL
     AND deleted_at IS NULL;

  UPDATE public.project_collaborators
     SET paid_amount = COALESCE(v_legacy, 0) + COALESCE(v_live, 0)
   WHERE id = p_collaborator_id;

  RETURN COALESCE(v_legacy, 0) + COALESCE(v_live, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public._recalc_collaborator_paid(uuid) FROM PUBLIC, anon;

-- ---- create payment -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_collaborator_payment(
  p_collaborator_id uuid,
  p_amount numeric,
  p_payment_source text,
  p_paid_at timestamptz,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_project    uuid;
  v_owner      uuid;
  v_proj_name  text;
  v_name       text;
  v_total      numeric(12,2);
  v_legacy     numeric(12,2);
  v_live       numeric(12,2);
  v_remaining  numeric(12,2);
  v_amount     numeric(12,2);
  v_expense_id uuid;
  v_payment_id uuid;
  v_after      numeric(12,2);
BEGIN
  -- FAZA 1: sve provjere prije bilo kojeg upisa.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'create_collaborator_payment: unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR ROUND(p_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'create_collaborator_payment: amount must be positive' USING ERRCODE = '22023';
  END IF;
  v_amount := ROUND(p_amount, 2);

  IF p_payment_source IS NULL OR length(btrim(p_payment_source)) = 0 THEN
    RAISE EXCEPTION 'create_collaborator_payment: payment_source required' USING ERRCODE = '22023';
  END IF;

  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'create_collaborator_payment: paid_at required' USING ERRCODE = '22023';
  END IF;

  SELECT c.project_id,
         COALESCE(NULLIF(btrim(COALESCE(c.company_name, '')), ''),
                  btrim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
         ROUND(COALESCE(c.total_price, 0), 2),
         ROUND(COALESCE(c.legacy_paid_amount, 0), 2)
    INTO v_project, v_name, v_total, v_legacy
    FROM public.project_collaborators c
   WHERE c.id = p_collaborator_id
   FOR UPDATE;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'create_collaborator_payment: collaborator not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.user_id, p.name INTO v_owner, v_proj_name
    FROM public.projects p WHERE p.id = v_project;

  IF v_owner IS NULL OR v_owner <> v_caller THEN
    RAISE EXCEPTION 'create_collaborator_payment: not project owner' USING ERRCODE = '42501';
  END IF;

  SELECT ROUND(COALESCE(SUM(amount), 0), 2) INTO v_live
    FROM public.project_collaborator_payments
   WHERE collaborator_id = p_collaborator_id
     AND status = 'paid'
     AND voided_at IS NULL
     AND deleted_at IS NULL;

  -- Strop postoji SAMO kad je dogovoreni iznos upisan (total_price > 0).
  IF v_total > 0 THEN
    v_remaining := ROUND(v_total - (v_legacy + v_live), 2);
    IF v_amount > v_remaining + 0.01 THEN
      RAISE EXCEPTION 'create_collaborator_payment: collab_payment_exceeds_remaining (max=%)', GREATEST(v_remaining, 0)
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- FAZA 2: upisi.
  v_expense_id := gen_random_uuid();
  v_payment_id := gen_random_uuid();

  INSERT INTO public.expenses (
    id, user_id, type, amount, payment_source, project_id,
    date, event_at, time_confidence, user_edited_event_at,
    category, description, note
  ) VALUES (
    v_expense_id, v_caller, 'expense', v_amount, p_payment_source, v_project,
    p_paid_at, p_paid_at, 'C2', true,
    'other',
    'Plaćanje suradniku: ' || COALESCE(NULLIF(v_name, ''), 'suradnik')
      || ' — ' || COALESCE(NULLIF(v_proj_name, ''), 'projekt'),
    p_note
  );

  INSERT INTO public.project_collaborator_payments (
    id, collaborator_id, project_id, user_id, amount, paid_at,
    payment_source, note, expense_id, status
  ) VALUES (
    v_payment_id, p_collaborator_id, v_project, v_caller, v_amount, p_paid_at,
    p_payment_source, p_note, v_expense_id, 'paid'
  );

  v_after := public._recalc_collaborator_paid(p_collaborator_id);

  RETURN jsonb_build_object(
    'payment_id',       v_payment_id,
    'expense_id',       v_expense_id,
    'amount',           v_amount,
    'paid_amount_after', v_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_collaborator_payment(uuid, numeric, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_collaborator_payment(uuid, numeric, text, timestamptz, text) TO authenticated;

-- ---- void payment ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_collaborator_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL
)
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
    UPDATE public.expenses SET deleted_at = now() WHERE id = v_expense_id;
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

REVOKE ALL ON FUNCTION public.void_collaborator_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_collaborator_payment(uuid, text) TO authenticated;