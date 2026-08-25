-- =====================================================================
-- 1) STRANI DOBAVLJAČ BEZ OIB-a
-- =====================================================================
ALTER TABLE public.incoming_invoices ALTER COLUMN supplier_oib DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.mail_norm_supplier_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]', '', 'g');
$$;

-- Zamjenski ključ jedinstvenosti kad OIB-a nema: naziv + broj + tip dokumenta.
CREATE UNIQUE INDEX IF NOT EXISTS incoming_invoices_unique_personal_noib
  ON public.incoming_invoices (
    user_id, direction, public.mail_norm_supplier_name(supplier_name), invoice_number, doc_type
  )
  WHERE supplier_oib IS NULL AND business_profile_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS incoming_invoices_unique_business_noib
  ON public.incoming_invoices (
    business_profile_id, direction, public.mail_norm_supplier_name(supplier_name), invoice_number, doc_type
  )
  WHERE supplier_oib IS NULL AND business_profile_id IS NOT NULL;

-- =====================================================================
-- 2) PAMĆENJE ODBIJANJA
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.mail_rejection_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  signature text NOT NULL,
  reject_count integer NOT NULL DEFAULT 0,
  last_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sender_email, signature)
);

GRANT SELECT, DELETE ON public.mail_rejection_memory TO authenticated;
GRANT ALL ON public.mail_rejection_memory TO service_role;

ALTER TABLE public.mail_rejection_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vlasnik cita svoja pravila odbijanja"
  ON public.mail_rejection_memory FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Vlasnik brise svoja pravila odbijanja"
  ON public.mail_rejection_memory FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_mail_rejection_memory_updated_at
  BEFORE UPDATE ON public.mail_rejection_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Adresa pošiljatelja iz `From` zaglavlja — jedno mjesto istine u bazi.
CREATE OR REPLACE FUNCTION public.mail_sender_email(p_from_header text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce((regexp_match(lower(coalesce(p_from_header, '')), '([^\s<>,;]+@[^\s<>,;]+)'))[1], '');
$$;

-- Potpis VRSTE poruke: naslov bez brojeva + ima li privitak + klasifikacija.
CREATE OR REPLACE FUNCTION public.mail_reject_signature(
  p_subject text, p_has_attachment boolean, p_classification text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT left(
    regexp_replace(regexp_replace(lower(coalesce(p_subject, '')), '[0-9]+', '#', 'g'), '[^a-z#]+', '', 'g'),
    120
  ) || ':' || CASE WHEN p_has_attachment THEN 'att' ELSE 'noatt' END
    || ':' || coalesce(nullif(btrim(coalesce(p_classification, '')), ''), '-');
$$;

REVOKE ALL ON FUNCTION public.mail_norm_supplier_name(text) FROM anon;
REVOKE ALL ON FUNCTION public.mail_sender_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.mail_reject_signature(text, boolean, text) FROM anon;

-- Odbacivanje koje UČI. Nikad ne briše dokument.
CREATE OR REPLACE FUNCTION public.mail_item_discard(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.document_ingest_items%ROWTYPE;
  v_from text;
  v_subject text;
  v_sig text;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;

  SELECT * INTO v_item FROM public.document_ingest_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'stavka_ne_postoji'; END IF;
  IF v_item.owner_user_id <> v_uid THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;

  UPDATE public.document_ingest_items
     SET status = 'odbacio_korisnik', updated_at = now()
   WHERE id = p_item_id;

  SELECT from_header, subject INTO v_from, v_subject
    FROM public.inbound_messages WHERE id = v_item.message_id;

  IF v_from IS NULL OR public.mail_sender_email(v_from) = '' THEN
    RETURN jsonb_build_object('ok', true, 'learned', false, 'count', 0);
  END IF;

  v_sig := public.mail_reject_signature(
    v_subject, v_item.attachment_id IS NOT NULL, v_item.classification
  );

  INSERT INTO public.mail_rejection_memory (user_id, sender_email, signature, reject_count, last_subject)
  VALUES (v_uid, public.mail_sender_email(v_from), v_sig, 1, v_subject)
  ON CONFLICT (user_id, sender_email, signature) DO UPDATE
    SET reject_count = public.mail_rejection_memory.reject_count + 1,
        last_subject = EXCLUDED.last_subject,
        updated_at = now()
  RETURNING reject_count INTO v_count;

  RETURN jsonb_build_object('ok', true, 'learned', true, 'count', v_count, 'muted', v_count >= 2);
END;
$$;

-- Vraćanje stavke u red + poništenje naučenog pravila.
CREATE OR REPLACE FUNCTION public.mail_item_restore(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.document_ingest_items%ROWTYPE;
  v_from text;
  v_subject text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;

  SELECT * INTO v_item FROM public.document_ingest_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'stavka_ne_postoji'; END IF;
  IF v_item.owner_user_id <> v_uid THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;

  UPDATE public.document_ingest_items
     SET status = 'na_pregledu', reason = NULL, updated_at = now()
   WHERE id = p_item_id;

  SELECT from_header, subject INTO v_from, v_subject
    FROM public.inbound_messages WHERE id = v_item.message_id;

  IF v_from IS NOT NULL THEN
    DELETE FROM public.mail_rejection_memory
     WHERE user_id = v_uid
       AND sender_email = public.mail_sender_email(v_from)
       AND signature = public.mail_reject_signature(
             v_subject, v_item.attachment_id IS NOT NULL, v_item.classification);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Provjera za worker (service role): je li vrsta poruke utišana.
CREATE OR REPLACE FUNCTION public.mail_reject_muted(
  p_user_id uuid, p_from_header text, p_subject text,
  p_has_attachment boolean, p_classification text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mail_rejection_memory
     WHERE user_id = p_user_id
       AND sender_email = public.mail_sender_email(p_from_header)
       AND sender_email <> ''
       AND signature = public.mail_reject_signature(p_subject, p_has_attachment, p_classification)
       AND reject_count >= 2
  );
$$;

REVOKE ALL ON FUNCTION public.mail_item_discard(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mail_item_restore(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mail_reject_muted(uuid, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mail_item_discard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_item_restore(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_reject_muted(uuid, text, text, boolean, text) TO service_role;

-- =====================================================================
-- 3) mail_item_confirm — OIB postaje upozorenje, ne brana
-- =====================================================================
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
  v_doc_type text := COALESCE(NULLIF(btrim(COALESCE(p_payload->>'doc_type', '')), ''), '380');
  v_oib text := NULLIF(btrim(COALESCE(p_payload->>'supplier_oib', '')), '');
  v_number text := NULLIF(btrim(COALESCE(p_payload->>'invoice_number', '')), '');
  v_place_label text := NULLIF(btrim(COALESCE(p_payload->>'place_label', '')), '');
  v_place_code text := COALESCE(btrim(COALESCE(p_payload->>'place_code', '')), '');
  v_from_header text;
  v_remember boolean := COALESCE(p_payload->>'remember_issuer', 'true') <> 'false';
  v_issue_date date := public.mail_norm_date(p_payload->>'issue_date');
  v_due_date date := public.mail_norm_date(p_payload->>'due_date');
  -- STRANI IZDAVATELJ: nedostatak OIB-a je upozorenje uz SVJESNU potvrdu.
  v_allow_no_oib boolean := COALESCE(p_payload->>'allow_missing_oib', 'false') = 'true';
  v_name_norm text := public.mail_norm_supplier_name(p_payload->>'supplier_name');
  v_amount numeric := COALESCE(NULLIF(p_payload->>'total_amount','')::numeric, 0);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;

  SELECT * INTO v_item FROM public.document_ingest_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'stavka_ne_postoji'; END IF;

  IF v_item.classification = 'verifikacija_prosljedjivanja' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_dokument');
  END IF;

  IF v_item.scope_type = 'user' THEN
    IF v_item.scope_id <> v_uid THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;
    v_bpid := NULL;
  ELSE
    SELECT id INTO v_bpid FROM public.business_profiles
      WHERE id = v_item.scope_id AND user_id = v_uid;
    IF v_bpid IS NULL THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;
  END IF;

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

  -- Broj dokumenta OSTAJE obavezan.
  IF v_number IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nedostaju_polja');
  END IF;

  IF v_oib IS NULL THEN
    IF NOT v_allow_no_oib THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'nedostaje_oib');
    END IF;
    -- Bez OIB-a naziv dobavljača NOSI identitet — bez njega nema ključa.
    IF v_name_norm = '' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'nedostaje_naziv');
    END IF;
  END IF;

  IF v_oib IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.incoming_invoices
     WHERE direction = v_direction
       AND supplier_oib = v_oib
       AND invoice_number = v_number
       AND doc_type = v_doc_type
       AND ((v_bpid IS NULL AND business_profile_id IS NULL AND user_id = v_uid)
         OR (v_bpid IS NOT NULL AND business_profile_id = v_bpid));
  ELSE
    SELECT * INTO v_existing FROM public.incoming_invoices
     WHERE direction = v_direction
       AND supplier_oib IS NULL
       AND public.mail_norm_supplier_name(supplier_name) = v_name_norm
       AND invoice_number = v_number
       AND doc_type = v_doc_type
       AND ((v_bpid IS NULL AND business_profile_id IS NULL AND user_id = v_uid)
         OR (v_bpid IS NOT NULL AND business_profile_id = v_bpid));
  END IF;

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
      issue_date      = COALESCE(v_issue_date, issue_date),
      due_date        = COALESCE(v_due_date, due_date),
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
      v_issue_date,
      v_due_date,
      v_amount,
      NULLIF(p_payload->>'vat_amount','')::numeric,
      COALESCE(p_payload->>'currency', 'EUR'),
      p_payload->>'iban',
      COALESCE(p_payload->'items', '[]'::jsonb),
      COALESCE(
        p_payload->>'fingerprint',
        CASE
          WHEN v_oib IS NOT NULL
            THEN encode(extensions.digest(v_oib || '|' || v_number, 'sha256'), 'hex')
          ELSE encode(extensions.digest(
                 'noib|' || v_name_norm || '|' || v_number || '|' ||
                 trim(to_char(v_amount, 'FM9999999990.00')) || '|' ||
                 COALESCE(v_issue_date::text, ''), 'sha256'), 'hex')
        END),
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

  -- UCENJE: samo uz OIB (on je ključ pamćenja) i uz izričitu privolu.
  IF v_item.message_id IS NOT NULL AND v_remember AND v_oib IS NOT NULL THEN
    SELECT from_header INTO v_from_header FROM public.inbound_messages WHERE id = v_item.message_id;
    PERFORM public.mail_issuer_memory_upsert(
      v_uid, v_bpid, public.mail_from_domain(v_from_header),
      v_oib, v_place_code, p_payload->>'supplier_name', v_place_label,
      p_payload->>'iban'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice_id, 'replaced', v_existing.id IS NOT NULL, 'already', false);
END;
$function$;