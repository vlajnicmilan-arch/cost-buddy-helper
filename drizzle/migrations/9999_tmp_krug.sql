-- Krug podmirenje s izborom izvora — DIO 1: baza.
-- Aditivno: nove nullable kolone u krug_settlement_ledger, bez backfilla.
-- Postojeći zapisi podmirenja i krug_mark_settled ostaju netaknuti.

ALTER TABLE public.krug_settlement_ledger
  ADD COLUMN IF NOT EXISTS payer_expense_id       uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_source_id        uuid REFERENCES public.custom_payment_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_expense_id   uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_source_id    uuid REFERENCES public.custom_payment_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_request_id      uuid,
  ADD COLUMN IF NOT EXISTS payer_amount           numeric,
  ADD COLUMN IF NOT EXISTS payer_currency         text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_krug_settlement_client_request
  ON public.krug_settlement_ledger (marked_by, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Opis transakcije: „Podmirenje duga — <ime druge osobe>", jezik korisnika.
-- Tekstovi su doslovno isti kao ključ krug.settlement.transaction_description
-- u src/i18n/locales/{hr,en,de}.json (vitest paritetni test). Bez imena Kruga.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.krug_settlement_description(p_user uuid, p_other uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lang text;
  v_name text;
BEGIN
  SELECT lower(COALESCE(preferred_language, 'hr')) INTO v_lang
    FROM public.profiles WHERE user_id = p_user LIMIT 1;
  SELECT NULLIF(trim(display_name), '') INTO v_name
    FROM public.profiles WHERE user_id = p_other LIMIT 1;
  IF v_name IS NULL THEN
    SELECT NULLIF(split_part(email, '@', 1), '') INTO v_name
      FROM auth.users WHERE id = p_other;
  END IF;
  v_name := COALESCE(v_name, '?');

  RETURN CASE COALESCE(v_lang, 'hr')
    WHEN 'en' THEN 'Debt settlement — ' || v_name
    WHEN 'de' THEN 'Schuldenausgleich — ' || v_name
    ELSE 'Podmirenje duga — ' || v_name
  END;
END $function$;

REVOKE ALL ON FUNCTION public.krug_settlement_description(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_settlement_description(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.krug_settlement_description(uuid, uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Dužnik bilježi podmirenje + transakciju na odabranom izvoru. Sve ili ništa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.krug_mark_settled_with_source(
  p_krug_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount numeric,
  p_currency text,
  p_payer_source_id uuid,
  p_client_request_id uuid,
  p_payer_amount numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock bigint;
  v_existing public.krug_settlement_ledger%ROWTYPE;
  v_src public.custom_payment_sources%ROWTYPE;
  v_currency text;
  v_src_currency text;
  v_payer_amount numeric;
  v_expense_id uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required' USING ERRCODE = '22023';
  END IF;

  -- Idempotencija: isti zahtjev istog korisnika vraća postojeći zapis.
  SELECT * INTO v_existing FROM public.krug_settlement_ledger
   WHERE marked_by = v_uid AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id,
      'payer_expense_id', v_existing.payer_expense_id, 'idempotent', true);
  END IF;

  IF NOT public.krug_is_full_member(p_krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF p_from_user = p_to_user THEN
    RAISE EXCEPTION 'from_equals_to' USING ERRCODE = '22023';
  END IF;
  IF v_uid <> p_from_user THEN
    RAISE EXCEPTION 'only_debtor_can_settle' USING ERRCODE = '42501';
  END IF;
  IF NOT public.krug_is_full_member(p_krug_id, p_from_user) OR
     NOT public.krug_is_full_member(p_krug_id, p_to_user) THEN
    RAISE EXCEPTION 'party_not_full_member' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR length(trim(p_currency)) = 0 THEN
    RAISE EXCEPTION 'invalid_currency' USING ERRCODE = '22023';
  END IF;
  v_currency := upper(trim(p_currency));

  IF p_payer_source_id IS NULL THEN
    RAISE EXCEPTION 'source_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_src FROM public.custom_payment_sources WHERE id = p_payer_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_write_payment_source(p_payer_source_id, v_uid) THEN
    RAISE EXCEPTION 'source_not_writable' USING ERRCODE = '42501';
  END IF;

  -- Valuta: bez izmišljanja tečaja. Različita valuta izvora => stvarno
  -- plaćeni iznos u valuti izvora je obavezan.
  v_src_currency := upper(COALESCE(NULLIF(trim(v_src.currency), ''), 'EUR'));
  IF v_src_currency = v_currency THEN
    IF p_payer_amount IS NOT NULL AND p_payer_amount <> p_amount THEN
      RAISE EXCEPTION 'payer_amount_mismatch' USING ERRCODE = '22023';
    END IF;
    v_payer_amount := p_amount;
  ELSE
    IF p_payer_amount IS NULL OR p_payer_amount <= 0 THEN
      RAISE EXCEPTION 'payer_amount_required' USING ERRCODE = '22023';
    END IF;
    v_payer_amount := p_payer_amount;
  END IF;

  -- Isti ključ zaključavanja kao krug_mark_settled (kanonski par).
  v_lock := hashtextextended(
    p_krug_id::text || ':' ||
    LEAST(p_from_user, p_to_user)::text || ':' ||
    GREATEST(p_from_user, p_to_user)::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock);

  -- Ponovna provjera nakon zaključavanja (utrka dvostrukog klika).
  SELECT * INTO v_existing FROM public.krug_settlement_ledger
   WHERE marked_by = v_uid AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id,
      'payer_expense_id', v_existing.payer_expense_id, 'idempotent', true);
  END IF;

  -- Transakcija dužnika: mijenja saldo izvora (postojeći trigger), ne ulazi
  -- u potrošnju (expense_nature = krug_settlement), NE nosi krug_id.
  INSERT INTO public.expenses (
    user_id, type, amount, payment_source, currency, description,
    expense_nature, status, submitted_by, client_request_id
  ) VALUES (
    v_uid, 'expense', v_payer_amount, 'custom:' || p_payer_source_id::text, v_src_currency,
    public.krug_settlement_description(v_uid, p_to_user),
    'krug_settlement', 'approved', v_uid, p_client_request_id
  ) RETURNING id INTO v_expense_id;

  INSERT INTO public.krug_settlement_ledger(
    krug_id, from_user, to_user, amount, currency, note, marked_by,
    payer_expense_id, payer_source_id, client_request_id, payer_amount, payer_currency
  ) VALUES (
    p_krug_id, p_from_user, p_to_user, p_amount, v_currency, NULLIF(p_note,''), v_uid,
    v_expense_id, p_payer_source_id, p_client_request_id, v_payer_amount, v_src_currency
  ) RETURNING id INTO v_id;

  -- Ista postojeća obavijest kao krug_mark_settled; best-effort.
  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_settlement_marked_settled',
      p_krug_id := p_krug_id,
      p_actor_id := v_uid,
      p_dedup_ref := 'settled:'||v_id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_mark_settled_with_source: notify failed (id=%): %', v_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id,
    'payer_expense_id', v_expense_id, 'idempotent', false);
END $function$;

REVOKE ALL ON FUNCTION public.krug_mark_settled_with_source(uuid, uuid, uuid, numeric, text, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_mark_settled_with_source(uuid, uuid, uuid, numeric, text, uuid, uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_mark_settled_with_source(uuid, uuid, uuid, numeric, text, uuid, uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Primatelj potvrđuje primitak u svoj izvor. Samo primatelj, jednom.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.krug_confirm_settlement_receipt(
  p_ledger_id uuid,
  p_recipient_source_id uuid,
  p_client_request_id uuid,
  p_recipient_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_settlement_ledger%ROWTYPE;
  v_src public.custom_payment_sources%ROWTYPE;
  v_src_currency text;
  v_amount numeric;
  v_expense_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.krug_settlement_ledger
   WHERE id = p_ledger_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_uid <> v_row.to_user THEN
    RAISE EXCEPTION 'only_recipient_can_confirm' USING ERRCODE = '42501';
  END IF;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided' USING ERRCODE = '22023';
  END IF;
  IF v_row.client_request_id IS NULL THEN
    -- Stari zapisi (prije izbora izvora) se ne potvrđuju naknadno.
    RAISE EXCEPTION 'legacy_settlement' USING ERRCODE = '22023';
  END IF;

  IF v_row.recipient_confirmed_at IS NOT NULL THEN
    -- Idempotentno: isti zahtjev (ista transakcija primatelja) vraća isto.
    IF EXISTS (SELECT 1 FROM public.expenses
                WHERE id = v_row.recipient_expense_id
                  AND client_request_id = p_client_request_id) THEN
      RETURN jsonb_build_object('ok', true, 'id', v_row.id,
        'recipient_expense_id', v_row.recipient_expense_id, 'idempotent', true);
    END IF;
    RAISE EXCEPTION 'already_confirmed' USING ERRCODE = '22023';
  END IF;

  IF p_recipient_source_id IS NULL THEN
    RAISE EXCEPTION 'source_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_src FROM public.custom_payment_sources WHERE id = p_recipient_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_write_payment_source(p_recipient_source_id, v_uid) THEN
    RAISE EXCEPTION 'source_not_writable' USING ERRCODE = '42501';
  END IF;

  v_src_currency := upper(COALESCE(NULLIF(trim(v_src.currency), ''), 'EUR'));
  IF v_src_currency = upper(v_row.currency) THEN
    IF p_recipient_amount IS NOT NULL AND p_recipient_amount <> v_row.amount THEN
      RAISE EXCEPTION 'recipient_amount_mismatch' USING ERRCODE = '22023';
    END IF;
    v_amount := v_row.amount;
  ELSE
    IF p_recipient_amount IS NULL OR p_recipient_amount <= 0 THEN
      RAISE EXCEPTION 'recipient_amount_required' USING ERRCODE = '22023';
    END IF;
    v_amount := p_recipient_amount;
  END IF;

  INSERT INTO public.expenses (
    user_id, type, amount, payment_source, currency, description,
    expense_nature, status, submitted_by, client_request_id
  ) VALUES (
    v_uid, 'income', v_amount, 'custom:' || p_recipient_source_id::text, v_src_currency,
    public.krug_settlement_description(v_uid, v_row.from_user),
    'krug_settlement', 'approved', v_uid, p_client_request_id
  ) RETURNING id INTO v_expense_id;

  UPDATE public.krug_settlement_ledger
     SET recipient_expense_id = v_expense_id,
         recipient_source_id = p_recipient_source_id,
         recipient_confirmed_at = now(),
         updated_at = now()
   WHERE id = p_ledger_id;

  RETURN jsonb_build_object('ok', true, 'id', p_ledger_id,
    'recipient_expense_id', v_expense_id, 'idempotent', false);
END $function$;

REVOKE ALL ON FUNCTION public.krug_confirm_settlement_receipt(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_confirm_settlement_receipt(uuid, uuid, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_confirm_settlement_receipt(uuid, uuid, uuid, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- krug_void_settlement — od žive definicije; dodano: povezane transakcije.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.krug_void_settlement(p_ledger_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_settlement_ledger%ROWTYPE;
  v_reason text;
  v_exp record;
  v_deleted uuid[] := ARRAY[]::uuid[];
  v_kept uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  v_reason := trim(p_reason);

  SELECT * INTO v_row FROM public.krug_settlement_ledger
   WHERE id = p_ledger_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  -- Poništenje je zaštita obiju strana duga: dopušteno dužniku i vjerovniku.
  IF v_uid <> v_row.from_user AND v_uid <> v_row.to_user THEN
    RAISE EXCEPTION 'only_party_can_void' USING ERRCODE = '42501';
  END IF;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided' USING ERRCODE = '22023';
  END IF;

  UPDATE public.krug_settlement_ledger
     SET voided_at = now(), voided_by = v_uid, void_reason = v_reason, updated_at = now()
   WHERE id = p_ledger_id;

  -- Povezane transakcije: nespojene idu u koš (saldo se vraća kroz postojeći
  -- trigger). Spojena s bankovnim retkom ostaje (i dalje krug_settlement),
  -- samo se odvaja od poništenog zapisa — bankovni redak se ne gubi.
  FOR v_exp IN
    SELECT e.id, e.deleted_at, e.bank_transaction_id, e.bank_match_status
      FROM public.expenses e
     WHERE e.id IN (v_row.payer_expense_id, v_row.recipient_expense_id)
     FOR UPDATE
  LOOP
    IF v_exp.deleted_at IS NOT NULL THEN
      CONTINUE;
    END IF;
    IF v_exp.bank_transaction_id IS NOT NULL OR v_exp.bank_match_status = 'confirmed' THEN
      v_kept := v_kept || v_exp.id;
    ELSE
      UPDATE public.expenses SET deleted_at = now(), deleted_by = v_uid WHERE id = v_exp.id;
      v_deleted := v_deleted || v_exp.id;
    END IF;
  END LOOP;

  IF COALESCE(array_length(v_kept, 1), 0) > 0 THEN
    UPDATE public.krug_settlement_ledger
       SET payer_expense_id = CASE WHEN payer_expense_id = ANY (v_kept) THEN NULL ELSE payer_expense_id END,
           recipient_expense_id = CASE WHEN recipient_expense_id = ANY (v_kept) THEN NULL ELSE recipient_expense_id END
     WHERE id = p_ledger_id;
  END IF;

  -- Additive best-effort: obavijest o poništenju NE smije srušiti void.
  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_settlement_voided',
      p_krug_id := v_row.krug_id,
      p_actor_id := v_uid,
      p_dedup_ref := 'voided:'||p_ledger_id::text,
      p_vars := jsonb_build_object(
        'reason', v_reason,
        'amount', to_char(v_row.amount, 'FM999999990.00'),
        'currency', v_row.currency
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_void_settlement: notify failed (id=%): %', p_ledger_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true,
    'deleted_expense_ids', to_jsonb(v_deleted),
    'bank_linked_kept', COALESCE(array_length(v_kept, 1), 0) > 0,
    'bank_linked_kept_ids', to_jsonb(v_kept));
END $function$;

REVOKE ALL ON FUNCTION public.krug_void_settlement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_void_settlement(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_void_settlement(uuid, text) TO authenticated;
