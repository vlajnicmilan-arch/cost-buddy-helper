-- ============================================================
-- MAIL UVOZ — PAMĆENJE IZDAVATELJA I MJESTA (D1)
-- ============================================================

-- Domena pošiljatelja iz From zaglavlja: "Ime <a@b.hr>" -> "b.hr"
CREATE OR REPLACE FUNCTION public.mail_from_domain(p_from text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(lower(btrim(split_part(regexp_replace(COALESCE(p_from, ''), '^.*<|>.*$', '', 'g'), '@', 2))), ''),
    ''
  )
$$;

CREATE TABLE IF NOT EXISTS public.mail_issuer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  -- Ključ: domena pošiljatelja + OIB izdavatelja + šifra obračunskog mjesta.
  -- place_code = '' znači "izdavatelj bez šifre mjesta" — takav zapis NIKAD
  -- ne smije nositi oznaku mjesta (brana Solin != Split).
  from_domain text NOT NULL DEFAULT '',
  supplier_oib text NOT NULL DEFAULT '',
  place_code text NOT NULL DEFAULT '',
  supplier_name text,
  place_label text,
  confirmed_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_issuer_memory TO authenticated;
GRANT ALL ON public.mail_issuer_memory TO service_role;

ALTER TABLE public.mail_issuer_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own mail issuer memory" ON public.mail_issuer_memory;
CREATE POLICY "own mail issuer memory"
  ON public.mail_issuer_memory FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS mail_issuer_memory_key_idx
  ON public.mail_issuer_memory (
    user_id,
    COALESCE(business_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    from_domain,
    supplier_oib,
    place_code
  );

CREATE INDEX IF NOT EXISTS mail_issuer_memory_lookup_idx
  ON public.mail_issuer_memory (user_id, supplier_oib);

DROP TRIGGER IF EXISTS mail_issuer_memory_touch ON public.mail_issuer_memory;
CREATE TRIGGER mail_issuer_memory_touch
  BEFORE UPDATE ON public.mail_issuer_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Oznaka mjesta na računu (aditivno).
ALTER TABLE public.incoming_invoices ADD COLUMN IF NOT EXISTS place_label text;
CREATE INDEX IF NOT EXISTS incoming_invoices_place_label_idx
  ON public.incoming_invoices (user_id, place_label);

-- ------------------------------------------------------------
-- Upsert pamćenja: uči SAMO iz potvrde. Prazan ključ (bez OIB-a
-- i bez domene) se ignorira. Oznaka mjesta se sprema samo kad
-- postoji šifra mjesta.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mail_issuer_memory_upsert(
  p_user_id uuid,
  p_business_profile_id uuid,
  p_from_domain text,
  p_supplier_oib text,
  p_place_code text,
  p_supplier_name text,
  p_place_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_domain text := COALESCE(btrim(lower(p_from_domain)), '');
  v_oib text := COALESCE(btrim(p_supplier_oib), '');
  v_code text := COALESCE(btrim(p_place_code), '');
  v_label text := NULLIF(btrim(COALESCE(p_place_label, '')), '');
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  -- Pozivatelj iz aplikacije smije pisati samo svoje pamćenje; service_role
  -- (auth.uid() IS NULL) i SECURITY DEFINER pozivi iz mail_item_confirm prolaze.
  IF v_uid IS NOT NULL AND v_uid <> p_user_id THEN
    RAISE EXCEPTION 'nije_dopusteno';
  END IF;

  IF v_domain = '' AND v_oib = '' THEN RETURN NULL; END IF;
  -- Bez šifre mjesta pamćenje NIKAD ne nosi oznaku mjesta.
  IF v_code = '' THEN v_label := NULL; END IF;

  INSERT INTO public.mail_issuer_memory (
    user_id, business_profile_id, from_domain, supplier_oib, place_code,
    supplier_name, place_label
  ) VALUES (
    p_user_id, p_business_profile_id, v_domain, v_oib, v_code,
    NULLIF(btrim(COALESCE(p_supplier_name, '')), ''), v_label
  )
  ON CONFLICT (
    user_id,
    COALESCE(business_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    from_domain, supplier_oib, place_code
  ) DO UPDATE SET
    supplier_name = COALESCE(EXCLUDED.supplier_name, public.mail_issuer_memory.supplier_name),
    place_label = COALESCE(EXCLUDED.place_label, public.mail_issuer_memory.place_label),
    confirmed_count = public.mail_issuer_memory.confirmed_count + 1,
    last_seen_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mail_issuer_memory_upsert(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_issuer_memory_upsert(uuid, uuid, text, text, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Naknadna korekcija oznake mjesta s police računa (D5).
-- Upisuje u račun I u pamćenje (kad je račun stigao mailom).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incoming_invoice_set_place(
  p_invoice_id uuid,
  p_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.incoming_invoices%ROWTYPE;
  v_label text := NULLIF(btrim(COALESCE(p_label, '')), '');
  v_from text;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;

  SELECT * INTO v_inv FROM public.incoming_invoices
   WHERE id = p_invoice_id AND user_id = v_uid FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;

  UPDATE public.incoming_invoices
     SET place_label = v_label, updated_at = now()
   WHERE id = p_invoice_id;

  SELECT im.from_header, COALESCE(it.extraction->>'place_code', '')
    INTO v_from, v_code
    FROM public.document_links dl
    JOIN public.document_ingest_items it ON it.id = dl.item_id
    LEFT JOIN public.inbound_messages im ON im.id = it.message_id
   WHERE dl.target_type = 'incoming_invoice' AND dl.target_id = p_invoice_id
     AND it.message_id IS NOT NULL
   ORDER BY dl.created_at ASC
   LIMIT 1;

  IF v_from IS NOT NULL THEN
    PERFORM public.mail_issuer_memory_upsert(
      v_uid, v_inv.business_profile_id, public.mail_from_domain(v_from),
      COALESCE(v_inv.supplier_oib, ''), COALESCE(v_code, ''),
      v_inv.supplier_name, v_label
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'place_label', v_label);
END;
$$;

REVOKE ALL ON FUNCTION public.incoming_invoice_set_place(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incoming_invoice_set_place(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- mail_item_confirm — polazi od ŽIVE definicije; dodano samo:
-- place_label na račun + učenje pamćenja iz potvrde (samo mail).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mail_item_confirm(p_item_id uuid, p_payload jsonb, p_replace_existing_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.document_ingest_items%ROWTYPE;
  v_bpid uuid;
  v_invoice_id uuid;
  v_linked uuid;
  v_existing public.incoming_invoices%ROWTYPE;
  v_direction text := COALESCE(p_payload->>'direction', 'in');
  v_doc_type text := COALESCE(p_payload->>'doc_type', '380');
  v_oib text := NULLIF(btrim(COALESCE(p_payload->>'supplier_oib', '')), '');
  v_number text := NULLIF(btrim(COALESCE(p_payload->>'invoice_number', '')), '');
  v_place_label text := NULLIF(btrim(COALESCE(p_payload->>'place_label', '')), '');
  v_place_code text := COALESCE(btrim(COALESCE(p_payload->>'place_code', '')), '');
  v_from_header text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;

  SELECT * INTO v_item FROM public.document_ingest_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'stavka_ne_postoji'; END IF;

  IF v_item.scope_type = 'user' THEN
    IF v_item.scope_id <> v_uid THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;
    v_bpid := NULL;
  ELSE
    SELECT id INTO v_bpid FROM public.business_profiles
      WHERE id = v_item.scope_id AND user_id = v_uid;
    IF v_bpid IS NULL THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;
  END IF;

  -- IDEMPOTENCIJA: ista stavka (ili bilo koja stavka iste poruke) vec je
  -- povezana s ulaznim racunom -> vrati postojeci, NIKAD drugi insert.
  SELECT dl.target_id INTO v_linked
    FROM public.document_links dl
    JOIN public.document_ingest_items it ON it.id = dl.item_id
   WHERE dl.target_type = 'incoming_invoice'
     AND (
       dl.item_id = p_item_id
       OR (v_item.message_id IS NOT NULL AND it.message_id = v_item.message_id)
     )
   ORDER BY (dl.item_id = p_item_id) DESC, dl.created_at ASC
   LIMIT 1;

  IF v_linked IS NOT NULL THEN
    UPDATE public.document_ingest_items
       SET status = 'povezan', updated_at = now()
     WHERE id = p_item_id AND status <> 'povezan';

    INSERT INTO public.document_links (item_id, target_type, target_id)
    SELECT p_item_id, 'incoming_invoice', v_linked
     WHERE NOT EXISTS (SELECT 1 FROM public.document_links WHERE item_id = p_item_id);

    RETURN jsonb_build_object('ok', true, 'invoice_id', v_linked, 'already', true);
  END IF;

  IF v_item.status <> 'na_pregledu' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  IF v_oib IS NULL OR v_number IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nedostaju_polja');
  END IF;

  SELECT * INTO v_existing FROM public.incoming_invoices
   WHERE direction = v_direction
     AND supplier_oib = v_oib
     AND invoice_number = v_number
     AND doc_type = v_doc_type
     AND ((v_bpid IS NULL AND business_profile_id IS NULL AND user_id = v_uid)
       OR (v_bpid IS NOT NULL AND business_profile_id = v_bpid));

  IF v_existing.id IS NOT NULL AND p_replace_existing_id IS DISTINCT FROM v_existing.id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'mozda_vec_postoji',
      'existing', to_jsonb(v_existing)
    );
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.incoming_invoices SET
      supplier_name   = COALESCE(p_payload->>'supplier_name', supplier_name),
      issue_date      = COALESCE(NULLIF(p_payload->>'issue_date','')::date, issue_date),
      due_date        = COALESCE(NULLIF(p_payload->>'due_date','')::date, due_date),
      total_amount    = COALESCE(NULLIF(p_payload->>'total_amount','')::numeric, total_amount),
      vat_amount      = COALESCE(NULLIF(p_payload->>'vat_amount','')::numeric, vat_amount),
      iban            = COALESCE(p_payload->>'iban', iban),
      items           = COALESCE(p_payload->'items', items),
      source_filename = COALESCE(p_payload->>'source_filename', source_filename),
      note            = COALESCE(p_payload->>'note', note),
      place_label     = COALESCE(v_place_label, place_label),
      updated_at      = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_invoice_id;
  ELSE
    INSERT INTO public.incoming_invoices (
      user_id, business_profile_id, direction, doc_type,
      supplier_oib, supplier_name, invoice_number,
      issue_date, due_date, total_amount, vat_amount, currency,
      iban, items, fingerprint, source_filename, note, place_label
    ) VALUES (
      v_uid, v_bpid, v_direction, v_doc_type,
      v_oib, p_payload->>'supplier_name', v_number,
      NULLIF(p_payload->>'issue_date','')::date,
      NULLIF(p_payload->>'due_date','')::date,
      COALESCE(NULLIF(p_payload->>'total_amount','')::numeric, 0),
      NULLIF(p_payload->>'vat_amount','')::numeric,
      COALESCE(p_payload->>'currency', 'EUR'),
      p_payload->>'iban',
      COALESCE(p_payload->'items', '[]'::jsonb),
      COALESCE(p_payload->>'fingerprint',
               encode(extensions.digest(v_oib || '|' || v_number, 'sha256'), 'hex')),
      p_payload->>'source_filename',
      p_payload->>'note',
      v_place_label
    ) RETURNING id INTO v_invoice_id;
  END IF;

  INSERT INTO public.document_links (item_id, target_type, target_id)
  VALUES (p_item_id, 'incoming_invoice', v_invoice_id)
  ON CONFLICT (item_id) DO UPDATE SET target_id = EXCLUDED.target_id;

  UPDATE public.document_ingest_items
     SET status = 'povezan',
         extraction = COALESCE(p_payload, extraction),
         doc_type = v_doc_type,
         updated_at = now()
   WHERE id = p_item_id;

  -- UČENJE: samo iz potvrde stavke koja je STIGLA MAILOM. Ručni XML upload
  -- (bez message_id) se NE uči — nema pouzdanog identiteta pošiljatelja.
  IF v_item.message_id IS NOT NULL THEN
    SELECT from_header INTO v_from_header FROM public.inbound_messages WHERE id = v_item.message_id;
    PERFORM public.mail_issuer_memory_upsert(
      v_uid, v_bpid, public.mail_from_domain(v_from_header),
      v_oib, v_place_code, p_payload->>'supplier_name', v_place_label
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice_id, 'replaced', v_existing.id IS NOT NULL, 'already', false);
END;
$function$;
