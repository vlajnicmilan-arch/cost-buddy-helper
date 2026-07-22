
-- =========================================================================
-- FAZA 2: preview_source_balance_after_batch + align_source_to_bank
-- Pravilo C: sve usporedbe salda idu kroz živi engine
-- (recompute_custom_source_balance_preview, hybrid mod).
-- Ova migracija dodaje samo funkcije. Ne mijenja korisničke tablice.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.preview_source_balance_after_batch(
  p_source_id uuid,
  p_batch_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_owner        uuid;
  v_app_balance  numeric(12,2);
  v_bank_balance numeric(12,2);
  v_delta        numeric(12,2);
  v_row_count    integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'preview_source_balance_after_batch: unauthenticated'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner
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

  IF v_app_balance IS NOT NULL AND v_bank_balance IS NOT NULL THEN
    v_delta := (v_app_balance - v_bank_balance)::numeric(12,2);
  END IF;

  RETURN jsonb_build_object(
    'source_id',    p_source_id,
    'batch_id',     p_batch_id,
    'app_balance',  v_app_balance,
    'bank_balance', v_bank_balance,
    'delta',        v_delta,
    'engine_mode',  'hybrid',
    'has_bank_row', v_bank_balance IS NOT NULL
  );
END $$;

REVOKE ALL ON FUNCTION public.preview_source_balance_after_batch(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_source_balance_after_batch(uuid, uuid) TO authenticated;


-- ---------------------------------------------------------------
-- align_source_to_bank
-- Postavlja novo sidro (anchor_source='bank_reconciliation') na trenutak
-- `as_of + 1s` s vrijednošću `bank_balance`. Idempotentno: ako zadnje sidro
-- već točno odgovara traženim parametrima, ne piše ponovno.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.align_source_to_bank(
  p_source_id    uuid,
  p_bank_balance numeric,
  p_as_of        timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller             uuid := auth.uid();
  v_owner              uuid;
  v_old_anchor_date    timestamptz;
  v_old_anchor_balance numeric(12,2);
  v_old_balance        numeric(12,2);
  v_new_anchor_date    timestamptz;
  v_new_anchor_balance numeric(12,2);
  v_already_aligned    boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'align_source_to_bank: unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'align_source_to_bank: as_of required' USING ERRCODE = '22004';
  END IF;

  v_new_anchor_date    := p_as_of + interval '1 second';
  v_new_anchor_balance := round(p_bank_balance::numeric, 2);

  SELECT user_id, correction_anchor_date, correction_anchor_balance, balance
    INTO v_owner, v_old_anchor_date, v_old_anchor_balance, v_old_balance
    FROM public.custom_payment_sources
    WHERE id = p_source_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'align_source_to_bank: source % not found', p_source_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> v_caller THEN
    RAISE EXCEPTION 'align_source_to_bank: not owner' USING ERRCODE = '42501';
  END IF;

  -- Idempotency: zadnji audit red već identičan?
  v_already_aligned := EXISTS (
    SELECT 1
      FROM public.anchor_audit aa
     WHERE aa.source_id = p_source_id
       AND aa.anchor_source = 'bank_reconciliation'
       AND aa.new_anchor_date    = v_new_anchor_date
       AND aa.new_anchor_balance = v_new_anchor_balance
       AND aa.created_at = (
         SELECT max(created_at) FROM public.anchor_audit WHERE source_id = p_source_id
       )
  );

  IF v_already_aligned THEN
    RETURN jsonb_build_object(
      'source_id',           p_source_id,
      'aligned',             true,
      'idempotent_skip',     true,
      'new_anchor_date',     v_new_anchor_date,
      'new_anchor_balance',  v_new_anchor_balance
    );
  END IF;

  PERFORM set_config('app.allow_anchor_write', 'on', true);
  PERFORM set_config('app.balance_writer', 'engine', true);

  UPDATE public.custom_payment_sources
     SET correction_anchor_date    = v_new_anchor_date,
         correction_anchor_balance = v_new_anchor_balance,
         balance                   = v_new_anchor_balance,
         anchor_source             = 'bank_reconciliation',
         updated_at                = now()
   WHERE id = p_source_id;

  PERFORM set_config('app.balance_writer', '', true);

  INSERT INTO public.anchor_audit
    (source_id, user_id, old_anchor_date, old_anchor_balance, old_balance,
     new_anchor_date, new_anchor_balance, anchor_source, reason, actor)
  VALUES
    (p_source_id, v_owner, v_old_anchor_date, v_old_anchor_balance, v_old_balance,
     v_new_anchor_date, v_new_anchor_balance, 'bank_reconciliation',
     'align_source_to_bank: user prihvatio bankin završni saldo za batch',
     v_caller);

  RETURN jsonb_build_object(
    'source_id',           p_source_id,
    'aligned',             true,
    'idempotent_skip',     false,
    'old_anchor_date',     v_old_anchor_date,
    'old_anchor_balance',  v_old_anchor_balance,
    'new_anchor_date',     v_new_anchor_date,
    'new_anchor_balance',  v_new_anchor_balance
  );
END $$;

REVOKE ALL ON FUNCTION public.align_source_to_bank(uuid, numeric, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.align_source_to_bank(uuid, numeric, timestamptz) TO authenticated;
