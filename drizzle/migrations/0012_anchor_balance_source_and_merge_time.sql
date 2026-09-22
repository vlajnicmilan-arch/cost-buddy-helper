-- KORAK 2 — SIDRO SALDA
-- A) Bankin saldo smije doći samo s retka čiji je PLATITELJ taj novčanik.
-- C) Spajanje slikanog i bankovnog retka ne smije pomicati saldo.
-- D) U anchor_audit se bilježi izvor salda (redak izvoda / korisnik / EB sync).

-- ---------------------------------------------------------------- D) audit
ALTER TABLE public.anchor_audit
  ADD COLUMN IF NOT EXISTS balance_source text,
  ADD COLUMN IF NOT EXISTS balance_source_row_id uuid;

COMMENT ON COLUMN public.anchor_audit.balance_source IS
  'Odakle dolazi saldo sidra: statement_row | user_input | bank_sync | unknown';
COMMENT ON COLUMN public.anchor_audit.balance_source_row_id IS
  'expenses.id retka izvoda s kojeg je uzet balance_after (samo za statement_row)';

-- ------------------------------------------------- A) preview (payer-only)
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
  v_bank_row_id  uuid;
  v_delta        numeric(12,2);
  v_anchor_date  timestamptz;
  v_batch_last_at timestamptz;
  v_batch_last_conf text;
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
  -- SAMO redci s izvoda TOG novčanika (novčanik je PLATITELJ). Redak na kojem
  -- je novčanik samo primatelj prijenosa nosi saldo DRUGOG računa i ne smije se
  -- ponuditi kao bankin saldo.
  SELECT e.balance_after, e.id
    INTO v_bank_balance, v_bank_row_id
    FROM public.expenses e
   WHERE e.import_batch_id = p_batch_id
     AND e.deleted_at IS NULL
     AND e.balance_after IS NOT NULL
     AND public._extract_custom_source_id(e.payment_source) = p_source_id
   ORDER BY e.bank_row_seq DESC NULLS LAST, e.event_at DESC NULLS LAST
   LIMIT 1;

  -- Vremenska pozicija batcha: zadnji redak izvoda za ovaj source (obje strane).
  SELECT COALESCE(e.event_at, e.date), COALESCE(e.time_confidence, 'C3')
    INTO v_batch_last_at, v_batch_last_conf
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

  IF v_anchor_date IS NOT NULL AND v_batch_last_at IS NOT NULL THEN
    v_is_historical := (v_batch_last_at::date <= v_anchor_date::date);
  END IF;

  RETURN jsonb_build_object(
    'source_id',     p_source_id,
    'batch_id',      p_batch_id,
    'app_balance',   v_app_balance,
    'bank_balance',  v_bank_balance,
    'bank_balance_row_id', v_bank_row_id,
    'delta',         v_delta,
    'engine_mode',   'hybrid',
    'has_bank_row',  v_bank_balance IS NOT NULL,
    'anchor_date',   v_anchor_date,
    'batch_last_at', v_batch_last_at,
    'batch_last_confidence', v_batch_last_conf,
    'is_historical', v_is_historical
  );
END $function$;

-- ----------------------------------------- D) align s izvorom salda u auditu
DROP FUNCTION IF EXISTS public.align_source_to_bank(uuid, numeric, timestamptz);

CREATE OR REPLACE FUNCTION public.align_source_to_bank(
  p_source_id uuid,
  p_bank_balance numeric,
  p_as_of timestamp with time zone,
  p_balance_source text DEFAULT 'unknown',
  p_balance_source_row_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller             uuid := auth.uid();
  v_owner              uuid;
  v_old_anchor_date    timestamptz;
  v_old_anchor_balance numeric(12,2);
  v_old_balance        numeric(12,2);
  v_new_anchor_date    timestamptz;
  v_new_anchor_balance numeric(12,2);
  v_already_aligned    boolean := false;
  v_balance_source     text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'align_source_to_bank: unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'align_source_to_bank: as_of required' USING ERRCODE = '22004';
  END IF;

  v_balance_source := COALESCE(NULLIF(p_balance_source, ''), 'unknown');
  IF v_balance_source NOT IN ('statement_row', 'statement_closing', 'user_input', 'bank_sync', 'unknown') THEN
    RAISE EXCEPTION 'align_source_to_bank: unknown balance source %', v_balance_source
      USING ERRCODE = '22023';
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

  -- Saldo s retka izvoda mora doći s retka koji PRIPADA tom novčaniku.
  IF v_balance_source = 'statement_row' THEN
    IF p_balance_source_row_id IS NULL THEN
      RAISE EXCEPTION 'align_source_to_bank: statement row id required' USING ERRCODE = '22004';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.expenses e
       WHERE e.id = p_balance_source_row_id
         AND e.user_id = v_caller
         AND e.deleted_at IS NULL
         AND public._extract_custom_source_id(e.payment_source) = p_source_id
    ) THEN
      RAISE EXCEPTION 'align_source_to_bank: balance row does not belong to source'
        USING ERRCODE = '22023';
    END IF;
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
     new_anchor_date, new_anchor_balance, anchor_source, reason, actor,
     balance_source, balance_source_row_id)
  VALUES
    (p_source_id, v_owner, v_old_anchor_date, v_old_anchor_balance, v_old_balance,
     v_new_anchor_date, v_new_anchor_balance, 'bank_reconciliation',
     'align_source_to_bank: user prihvatio saldo (' || v_balance_source || ')',
     v_caller, v_balance_source, p_balance_source_row_id);

  RETURN jsonb_build_object(
    'source_id',           p_source_id,
    'aligned',             true,
    'idempotent_skip',     false,
    'old_anchor_date',     v_old_anchor_date,
    'old_anchor_balance',  v_old_anchor_balance,
    'new_anchor_date',     v_new_anchor_date,
    'new_anchor_balance',  v_new_anchor_balance,
    'balance_source',      v_balance_source
  );
END $function$;

REVOKE ALL ON FUNCTION public.align_source_to_bank(uuid, numeric, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.align_source_to_bank(uuid, numeric, timestamptz, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.align_source_to_bank(uuid, numeric, timestamptz, text, uuid) TO authenticated;

-- --------------------------------------------- C) spajanje ne pomiče saldo
CREATE OR REPLACE FUNCTION public.merge_manual_with_bank(p_manual_id uuid, p_bank_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_manual RECORD;
  v_bank RECORD;
  v_max_amt numeric;
  v_day_diff int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_manual FROM public.expenses WHERE id = p_manual_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual_not_found'; END IF;
  IF v_manual.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'manual_deleted'; END IF;
  IF v_manual.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_manual.bank_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'manual_is_bank'; END IF;
  IF v_manual.bank_match_status = 'confirmed' THEN RAISE EXCEPTION 'already_confirmed'; END IF;

  SELECT * INTO v_bank FROM public.expenses WHERE id = p_bank_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_not_found'; END IF;
  IF v_bank.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'bank_deleted'; END IF;
  IF v_bank.user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_bank.bank_transaction_id IS NULL THEN RAISE EXCEPTION 'bank_is_manual'; END IF;

  -- Defense in depth: re-verify all client-side rules
  IF v_manual.type IS DISTINCT FROM v_bank.type THEN RAISE EXCEPTION 'different_type'; END IF;
  IF v_manual.type = 'transfer' THEN RAISE EXCEPTION 'transfer_not_allowed'; END IF;
  IF COALESCE(v_manual.expense_nature,'') = 'correction'
     OR COALESCE(v_bank.expense_nature,'') = 'correction' THEN
    RAISE EXCEPTION 'correction_not_allowed';
  END IF;
  IF COALESCE(v_manual.payment_source,'') IS DISTINCT FROM COALESCE(v_bank.payment_source,'') THEN
    RAISE EXCEPTION 'different_source';
  END IF;
  IF UPPER(COALESCE(v_manual.currency,'')) IS DISTINCT FROM UPPER(COALESCE(v_bank.currency,'')) THEN
    RAISE EXCEPTION 'different_currency';
  END IF;
  IF COALESCE(v_manual.is_advance,false) OR COALESCE(v_bank.is_advance,false) THEN
    RAISE EXCEPTION 'advance_protected';
  END IF;
  IF (v_manual.linked_advance_ids IS NOT NULL AND array_length(v_manual.linked_advance_ids,1) > 0)
     OR (v_bank.linked_advance_ids IS NOT NULL AND array_length(v_bank.linked_advance_ids,1) > 0) THEN
    RAISE EXCEPTION 'advance_protected';
  END IF;

  v_max_amt := GREATEST(ABS(v_manual.amount), ABS(v_bank.amount));
  IF v_max_amt = 0 OR ABS(ABS(v_manual.amount) - ABS(v_bank.amount)) / v_max_amt > 0.001 THEN
    RAISE EXCEPTION 'different_amount';
  END IF;

  v_day_diff := ABS((v_manual.date AT TIME ZONE 'UTC')::date - (v_bank.date AT TIME ZONE 'UTC')::date);
  IF v_day_diff > 4 THEN RAISE EXCEPTION 'date_too_far'; END IF;

  -- 1) Release the bank identity BEFORE promoting the manual row.
  UPDATE public.expenses
     SET bank_transaction_id = NULL,
         bank_match_status   = 'merged_into_manual',
         deleted_at          = now(),
         deleted_by          = v_uid
   WHERE id = p_bank_id;

  -- 2) Promote the manual/scanned row: it keeps ALL of its own content
  --    and inherits the full bank identity — INCLUDING the bank row's
  --    position relative to the anchor (event_at + time_confidence).
  --    Bez toga spajanje na usidrenom novčaniku pomiče saldo za iznos retka.
  UPDATE public.expenses
     SET bank_transaction_id  = v_bank.bank_transaction_id,
         bank_account_id      = COALESCE(v_bank.bank_account_id, bank_account_id),
         import_batch_id      = COALESCE(v_bank.import_batch_id, import_batch_id),
         balance_after        = v_bank.balance_after,
         bank_row_seq         = v_bank.bank_row_seq,
         bank_raw_line        = v_bank.bank_raw_line,
         bank_raw_line_source = v_bank.bank_raw_line_source,
         date                 = v_bank.date,
         event_at             = COALESCE(v_bank.event_at, event_at),
         time_confidence      = COALESCE(v_bank.time_confidence, time_confidence),
         user_edited_event_at = false,
         bank_match_status    = 'confirmed'
   WHERE id = p_manual_id;

  RETURN jsonb_build_object(
    'ok', true,
    'merged_into', p_manual_id,
    'archived_bank_id', p_bank_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_manual_with_bank(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_manual_with_bank(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_manual_with_bank(uuid, uuid) TO authenticated;