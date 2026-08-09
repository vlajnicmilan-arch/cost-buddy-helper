-- OBRAMBENA NORMALIZACIJA DATUMA: hrvatski oblik ("28.02.2026.") vise ne smije
-- pucati na INSERT-u. Kod i baza koriste ISTO pravilo (vidi dateNormalize.ts).
CREATE OR REPLACE FUNCTION public.mail_norm_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v text := btrim(COALESCE(p_value, ''));
  m text[];
BEGIN
  IF v = '' THEN RETURN NULL; END IF;

  -- ISO (uz eventualni vremenski dio)
  IF v ~ '^\d{4}-\d{1,2}-\d{1,2}' THEN
    BEGIN
      RETURN to_date(substring(v from '^\d{4}-\d{1,2}-\d{1,2}'), 'YYYY-MM-DD');
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END;
  END IF;

  -- Hrvatski oblik: 28.02.2026. | 28.2.2026 | 28. 02. 2026. | 28/2/2026
  m := regexp_match(v, '^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})\s*\.?$');
  IF m IS NOT NULL THEN
    BEGIN
      RETURN to_date(m[3] || '-' || lpad(m[2], 2, '0') || '-' || lpad(m[1], 2, '0'), 'YYYY-MM-DD');
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_norm_date(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_norm_date(text) TO authenticated, service_role;

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
  -- DEFAULT 380: dio PDF varijanti ne nosi citljiv tip dokumenta. Prazan tip
  -- pada na CHECK incoming_invoices_doc_type_present i blokira korisnika, pa
  -- se prazno tumaci kao obicni komercijalni racun (korisnik ga vidi i moze
  -- promijeniti prije potvrde).
  v_doc_type text := COALESCE(NULLIF(btrim(COALESCE(p_payload->>'doc_type', '')), ''), '380');
  v_oib text := NULLIF(btrim(COALESCE(p_payload->>'supplier_oib', '')), '');
  v_number text := NULLIF(btrim(COALESCE(p_payload->>'invoice_number', '')), '');
  v_place_label text := NULLIF(btrim(COALESCE(p_payload->>'place_label', '')), '');
  v_place_code text := COALESCE(btrim(COALESCE(p_payload->>'place_code', '')), '');
  v_from_header text;
  -- IZRICITA PRIVOLA: uci se samo kad korisnik nije iskljucio kvacicu.
  v_remember boolean := COALESCE(p_payload->>'remember_issuer', 'true') <> 'false';
  -- OBRAMBENA NORMALIZACIJA: AI dopuna zna vratiti hrvatski oblik datuma.
  v_issue_date date := public.mail_norm_date(p_payload->>'issue_date');
  v_due_date date := public.mail_norm_date(p_payload->>'due_date');
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

  -- UCENJE: samo iz potvrde stavke koja je STIGLA MAILOM i samo uz izricitu
  -- korisnikovu privolu. Rucni XML upload (bez message_id) se NE uci.
  IF v_item.message_id IS NOT NULL AND v_remember THEN
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

REVOKE ALL ON FUNCTION public.mail_item_confirm(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_item_confirm(uuid, jsonb, uuid) TO authenticated, service_role;