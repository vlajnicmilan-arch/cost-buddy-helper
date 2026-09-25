-- Radnici: potvrda primitka isplate na serveru (nalog 2/3).
-- Povezani radnik jednim pozivom upisuje prihod u svoj novčanik.
-- Obrazac: krug_confirm_settlement_receipt (client_request_id, already_confirmed, valuta).

CREATE FUNCTION public.worker_confirm_payout_receipt(
  p_source_id uuid,
  p_client_request_id uuid,
  p_payout_id uuid DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_count int;
  v_foreign int;
  v_voided int;
  v_total numeric;
  v_paid_at timestamptz;
  v_owner uuid;
  v_owner_count int;
  v_currencies text[];
  v_payout_currency text;
  v_src public.custom_payment_sources%ROWTYPE;
  v_src_currency text;
  v_amount numeric;
  v_owner_name text;
  v_existing public.expenses%ROWTYPE;
  v_expense_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required' USING ERRCODE = '22023';
  END IF;
  IF (p_payout_id IS NULL) = (p_batch_id IS NULL) THEN
    RAISE EXCEPTION 'exactly_one_target' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(pw.id ORDER BY pw.id)
    INTO v_ids
    FROM (SELECT id FROM public.project_worker_payouts
           WHERE (p_payout_id IS NOT NULL AND id = p_payout_id)
              OR (p_batch_id IS NOT NULL AND batch_id = p_batch_id)
           ORDER BY id
           FOR UPDATE) pw;
  v_count := COALESCE(array_length(v_ids, 1), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) FILTER (WHERE w.user_id IS DISTINCT FROM v_uid),
         count(*) FILTER (WHERE pw.status = 'voided' OR pw.voided_at IS NOT NULL OR pw.deleted_at IS NOT NULL),
         SUM(pw.paid_amount),
         MIN(pw.paid_at),
         MIN(p.user_id::text)::uuid,
         count(DISTINCT p.user_id),
         array_agg(DISTINCT upper(COALESCE(NULLIF(trim(cps.currency), ''), 'EUR')))
    INTO v_foreign, v_voided, v_total, v_paid_at, v_owner, v_owner_count, v_currencies
    FROM public.project_worker_payouts pw
    JOIN public.project_workers w ON w.id = pw.worker_id
    JOIN public.projects p ON p.id = pw.project_id
    LEFT JOIN public.custom_payment_sources cps
      ON pw.payment_source LIKE 'custom:%'
     AND cps.id::text = substr(pw.payment_source, 8)
   WHERE pw.id = ANY(v_ids);

  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'not_payout_recipient' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing FROM public.expenses
   WHERE user_id = v_uid AND client_request_id::text = p_client_request_id::text;
  IF FOUND THEN
    IF v_existing.worker_payout_id = ANY(v_ids)
       OR (p_batch_id IS NOT NULL AND v_existing.worker_payout_batch_id = p_batch_id) THEN
      RETURN jsonb_build_object('ok', true, 'expense_id', v_existing.id, 'idempotent', true);
    END IF;
    RAISE EXCEPTION 'client_request_id_reused' USING ERRCODE = '22023';
  END IF;

  IF v_voided > 0 THEN
    RAISE EXCEPTION 'payout_voided' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expenses e
     WHERE e.user_id = v_uid
       AND (e.worker_payout_id = ANY(v_ids)
            OR e.worker_payout_batch_id IN (
                 SELECT pw.batch_id FROM public.project_worker_payouts pw
                  WHERE pw.id = ANY(v_ids) AND pw.batch_id IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'already_confirmed' USING ERRCODE = '22023';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'source_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_src FROM public.custom_payment_sources WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_write_payment_source(p_source_id, v_uid) THEN
    RAISE EXCEPTION 'source_not_writable' USING ERRCODE = '42501';
  END IF;

  IF array_length(v_currencies, 1) > 1 THEN
    RAISE EXCEPTION 'mixed_currency' USING ERRCODE = '22023';
  END IF;
  v_payout_currency := v_currencies[1];
  v_src_currency := upper(COALESCE(NULLIF(trim(v_src.currency), ''), 'EUR'));
  v_total := ROUND(COALESCE(v_total, 0), 2);

  IF v_src_currency = v_payout_currency THEN
    IF p_amount IS NOT NULL AND ROUND(p_amount, 2) <> v_total THEN
      RAISE EXCEPTION 'amount_mismatch' USING ERRCODE = '22023';
    END IF;
    v_amount := v_total;
  ELSE
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RAISE EXCEPTION 'amount_required' USING ERRCODE = '22023';
    END IF;
    v_amount := ROUND(p_amount, 2);
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'amount_unknown' USING ERRCODE = '22023';
  END IF;

  SELECT NULLIF(btrim(display_name), '') INTO v_owner_name
    FROM public.profiles WHERE user_id = v_owner;
  IF v_owner_count <> 1 THEN
    v_owner_name := NULL;
  END IF;

  INSERT INTO public.expenses (
    user_id, type, amount, payment_source, currency, description, category,
    date, expense_nature, movement_kind, status, submitted_by, client_request_id,
    worker_payout_id, worker_payout_batch_id
  ) VALUES (
    v_uid, 'income', v_amount, 'custom:' || p_source_id::text, v_src_currency,
    CASE WHEN v_owner_name IS NULL THEN 'Isplata za rad'
         ELSE 'Isplata za rad — ' || v_owner_name END,
    'salary',
    COALESCE(v_paid_at, now()), NULL, NULL, 'approved', v_uid, p_client_request_id,
    CASE WHEN p_batch_id IS NULL THEN p_payout_id ELSE NULL END,
    p_batch_id
  ) RETURNING id INTO v_expense_id;

  RETURN jsonb_build_object('ok', true, 'expense_id', v_expense_id, 'amount', v_amount,
                            'currency', v_src_currency, 'idempotent', false);
END
$function$;

REVOKE ALL ON FUNCTION public.worker_confirm_payout_receipt(uuid, uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_confirm_payout_receipt(uuid, uuid, uuid, uuid, numeric) TO authenticated, service_role;