REVOKE ALL ON FUNCTION public.mail_confirm_log_reject(uuid, uuid, text, text[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_confirm_log_reject(uuid, uuid, text, text[], boolean, boolean) TO service_role;

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
  -- DOKUMENT BEZ BROJA (aplikacijski račun, blagajnički isječak): isti obrazac.
  v_allow_no_number boolean := COALESCE(p_payload->>'allow_missing_number', 'false') = 'true';
  v_name_norm text := public.mail_norm_supplier_name(p_payload->>'supplier_name');
  v_amount numeric := COALESCE(NULLIF(p_payload->>'total_amount','')::numeric, 0);
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;

  SELECT * INTO v_item FROM public.document_ingest_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'stavka_ne_postoji'; END IF;

  IF v_item.classification = 'verifikacija_prosljedjivanja' THEN
    PERFORM public.mail_confirm_log_reject(v_uid, p_item_id, 'nije_dokument', NULL, v_allow_no_oib, v_allow_no_number);
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
    PERFORM public.mail_confirm_log_reject(v_uid, p_item_id, 'stanje_ne_dopusta', NULL, v_allow_no_oib, v_allow_no_number);
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  -- Broj dokumenta OSTAJE obavezan, osim uz svjesnu kvačicu.
  IF v_number IS NULL AND NOT v_allow_no_number THEN
    v_missing := ARRAY['invoice_number'];
    PERFORM public.mail_confirm_log_reject(v_uid, p_item_id, 'nedostaju_polja', v_missing, v_allow_no_oib, v_allow_no_number);
    RETURN jsonb_build_object('ok', false, 'reason', 'nedostaju_polja', 'missing', to_jsonb(v_missing));
  END IF;

  -- Bez broja ključ nose dobavljač + datum + iznos. Bez njih nema ključa.
  IF v_number IS NULL THEN
    IF v_oib IS NULL AND v_name_norm = '' THEN
      v_missing := v_missing || 'supplier_name';
    END IF;
    IF v_issue_date IS NULL THEN
      v_missing := v_missing || 'issue_date';
    END IF;
    IF v_amount IS NULL OR v_amount = 0 THEN
      v_missing := v_missing || 'total_amount';
    END IF;
    IF array_length(v_missing, 1) > 0 THEN
      PERFORM public.mail_confirm_log_reject(v_uid, p_item_id, 'nedostaju_polja', v_missing, v_allow_no_oib, v_allow_no_number);
      RETURN jsonb_build_object('ok', false, 'reason', 'nedostaju_polja', 'missing', to_jsonb(v_missing));
    END IF;
  END IF;

  IF v_oib IS NULL THEN
    IF NOT v_allow_no_oib THEN
      PERFORM public.mail_confirm_log_reject(v_uid, p_item_id, 'nedostaje_oib', ARRAY['supplier_oib'], v_allow_no_oib, v_allow_no_number);
      RETURN jsonb_build_object('ok', false, 'reason', 'nedostaje_oib');
    END IF;
    -- Bez OIB-a naziv dobavljača NOSI identitet — bez njega nema ključa.
    IF v_name_norm = '' THEN
      PERFORM public.mail_confirm_log_reject(v_uid, p_item_id, 'nedostaje_naziv', ARRAY['supplier_name'], v_allow_no_oib, v_allow_no_number);
      RETURN jsonb_build_object('ok', false, 'reason', 'nedostaje_naziv');
    END IF;
  END IF;

  IF v_number IS NULL THEN
    -- MEKA PROVJERA bez broja: isti dobavljač + datum + iznos.
    SELECT * INTO v_existing FROM public.incoming_invoices
     WHERE direction = v_direction
       AND doc_type = v_doc_type
       AND issue_date IS NOT DISTINCT FROM v_issue_date
       AND total_amount = v_amount
       AND (
         (v_oib IS NOT NULL AND supplier_oib = v_oib)
         OR (v_oib IS NULL AND supplier_oib IS NULL
             AND public.mail_norm_supplier_name(supplier_name) = v_name_norm)
       )
       AND ((v_bpid IS NULL AND business_profile_id IS NULL AND user_id = v_uid)
         OR (v_bpid IS NOT NULL AND business_profile_id = v_bpid))
     ORDER BY created_at DESC
     LIMIT 1;
  ELSIF v_oib IS NOT NULL THEN
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
    PERFORM public.mail_confirm_log_reject(v_uid, p_item_id, 'mozda_vec_postoji', NULL, v_allow_no_oib, v_allow_no_number);
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
          WHEN v_number IS NULL
            THEN encode(extensions.digest(
                   'nonum|' || COALESCE(v_oib, 'noib|' || v_name_norm) || '|' ||
                   trim(to_char(v_amount, 'FM9999999990.00')) || '|' ||
                   COALESCE(v_issue_date::text, ''), 'sha256'), 'hex')
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