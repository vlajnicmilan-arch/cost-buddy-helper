CREATE OR REPLACE FUNCTION public.preview_source_balance_after_batch(p_source_id uuid, p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_owner        uuid;
  v_app_balance  numeric(12,2);
  v_bank_balance numeric(12,2);
  v_delta        numeric(12,2);
  v_row_count    integer;
  v_anchor_date  timestamptz;
  v_batch_last_at timestamptz;
  v_is_historical boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'preview_source_balance_after_batch: unauthenticated'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id, correction_anchor_date INTO v_owner, v_anchor_date
    FROM public.custom_payment_sources
    WHERE id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview_source_balance_after_batch: source % not found', p_source_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> v_caller THEN
    RAISE EXCEPTION 'preview_source_balance_after_batch: not owner'
      USING ERRCODE = '42501';
  END IF;

  -- App saldo — živi engine, hybrid mod (pravilo C).
  v_app_balance := public.recompute_custom_source_balance_preview(p_source_id, 'hybrid');

  -- Bankin završni saldo za ovaj source unutar batcha:
  -- red s najvećim bank_row_seq (zadnji red izvoda) i ne-NULL balance_after.
  SELECT e.balance_after, count(*) OVER ()
    INTO v_bank_balance, v_row_count
    FROM public.expenses e
   WHERE e.import_batch_id = p_batch_id
     AND e.deleted_at IS NULL
     AND e.balance_after IS NOT NULL
     AND (
       public._extract_custom_source_id(e.payment_source) = p_source_id
       OR e.income_source_id = p_source_id
     )
   ORDER BY e.bank_row_seq DESC NULLS LAST, e.event_at DESC NULLS LAST
   LIMIT 1;

  -- Vremenska pozicija batcha: timestamp zadnjeg retka izvoda za ovaj source.
  -- Koristi se i kao as_of za sidro i kao test "je li izvod povijesni".
  SELECT COALESCE(e.event_at, e.date)
    INTO v_batch_last_at
    FROM public.expenses e
   WHERE e.import_batch_id = p_batch_id
     AND e.deleted_at IS NULL
     AND (
       public._extract_custom_source_id(e.payment_source) = p_source_id
       OR e.income_source_id = p_source_id
     )
   ORDER BY COALESCE(e.event_at, e.date) DESC, e.bank_row_seq DESC NULLS LAST
   LIMIT 1;

  IF v_app_balance IS NOT NULL AND v_bank_balance IS NOT NULL THEN
    v_delta := (v_app_balance - v_bank_balance)::numeric(12,2);
  END IF;

  -- Povijesni izvod = zadnji redak pada na dan sidra ili prije njega.
  -- Takav izvod ne mijenja saldo na dan sidra i ne smije tražiti odluku.
  IF v_anchor_date IS NOT NULL AND v_batch_last_at IS NOT NULL THEN
    v_is_historical := (v_batch_last_at::date <= v_anchor_date::date);
  END IF;

  RETURN jsonb_build_object(
    'source_id',     p_source_id,
    'batch_id',      p_batch_id,
    'app_balance',   v_app_balance,
    'bank_balance',  v_bank_balance,
    'delta',         v_delta,
    'engine_mode',   'hybrid',
    'has_bank_row',  v_bank_balance IS NOT NULL,
    'anchor_date',   v_anchor_date,
    'batch_last_at', v_batch_last_at,
    'is_historical', v_is_historical
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.preview_source_balance_after_batch(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_source_balance_after_batch(uuid, uuid) TO authenticated;