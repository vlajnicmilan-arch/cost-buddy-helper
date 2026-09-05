-- 1) Poništenje uvoza vraća izvorni dokument u obradu, u ISTOJ transakciji.
CREATE OR REPLACE FUNCTION public.undo_import_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row_owner uuid;
  v_deleted int := 0;
  v_unmerged int := 0;
  v_transfers int := 0;
  v_freed_fp boolean := false;
  v_owned_count int;
  v_had_bank_anchor boolean := false;
  v_source_ids uuid[];
  v_stmt_ids uuid[];
  v_item_ids uuid[];
  v_released int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'batch_id_required';
  END IF;

  -- Ownership check: if the batch has any live row, ALL live rows must belong to caller.
  SELECT COUNT(*) INTO v_owned_count
    FROM public.expenses
   WHERE import_batch_id = p_batch_id
     AND deleted_at IS NULL;

  IF v_owned_count > 0 THEN
    SELECT DISTINCT user_id INTO v_row_owner
      FROM public.expenses
     WHERE import_batch_id = p_batch_id
       AND deleted_at IS NULL
     LIMIT 2;
    IF v_row_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'not_authorized_for_batch';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.expenses
       WHERE import_batch_id = p_batch_id
         AND deleted_at IS NULL
         AND user_id <> v_uid
    ) THEN
      RAISE EXCEPTION 'not_authorized_for_batch';
    END IF;
  END IF;

  SELECT array_agg(DISTINCT substr(payment_source, 8)::uuid)
    INTO v_source_ids
    FROM public.expenses
   WHERE import_batch_id = p_batch_id
     AND deleted_at IS NULL
     AND payment_source LIKE 'custom:%';

  IF v_source_ids IS NOT NULL THEN
    SELECT bool_or(anchor_source = 'bank_reconciliation')
      INTO v_had_bank_anchor
      FROM public.custom_payment_sources
     WHERE id = ANY(v_source_ids)
       AND user_id = v_uid;
  END IF;

  -- 2a) UNMERGE confirmed rows: preserve ALL user-edited fields.
  WITH upd AS (
    UPDATE public.expenses
       SET bank_transaction_id = NULL,
           bank_match_status   = 'manual',
           import_batch_id     = NULL
     WHERE import_batch_id = p_batch_id
       AND user_id         = v_uid
       AND bank_match_status = 'confirmed'
       AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_unmerged FROM upd;

  -- 2b) HARD DELETE bank_only rows (both plain inserts and transfers).
  WITH del_t AS (
    DELETE FROM public.expenses
     WHERE import_batch_id = p_batch_id
       AND user_id         = v_uid
       AND deleted_at IS NULL
       AND bank_match_status = 'bank_only'
       AND type = 'transfer'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_transfers FROM del_t;

  WITH del_r AS (
    DELETE FROM public.expenses
     WHERE import_batch_id = p_batch_id
       AND user_id         = v_uid
       AND deleted_at IS NULL
       AND bank_match_status = 'bank_only'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM del_r;

  -- 2b') Dokumenti iz mail lijevka vezani na uvoze ovog batcha — SKUPI IH PRIJE
  -- brisanja izvoda, inače veza nestane i dokument ostane mrtav u 'povezan'.
  SELECT array_agg(id) INTO v_stmt_ids
    FROM public.imported_statements
   WHERE import_batch_id = p_batch_id
     AND user_id = v_uid;

  IF v_stmt_ids IS NOT NULL THEN
    SELECT array_agg(DISTINCT item_id) INTO v_item_ids FROM (
      SELECT source_document_item_id AS item_id
        FROM public.imported_statements
       WHERE id = ANY(v_stmt_ids)
         AND source_document_item_id IS NOT NULL
      UNION
      SELECT l.item_id
        FROM public.document_links l
       WHERE l.target_type = 'imported_statement'
         AND l.target_id = ANY(v_stmt_ids)
    ) s;
  END IF;

  -- 2c) Delete imported_statements row(s) for this batch → frees fingerprint.
  WITH del_is AS (
    DELETE FROM public.imported_statements
     WHERE import_batch_id = p_batch_id
       AND user_id = v_uid
    RETURNING id
  )
  SELECT COUNT(*) > 0 INTO v_freed_fp FROM del_is;

  -- 2c') Ista transakcija: mrtva poveznica se briše, dokument se vraća na pregled.
  IF v_item_ids IS NOT NULL THEN
    DELETE FROM public.document_links l
     WHERE l.target_type = 'imported_statement'
       AND l.item_id = ANY(v_item_ids)
       AND NOT EXISTS (SELECT 1 FROM public.imported_statements s WHERE s.id = l.target_id);

    WITH rel AS (
      UPDATE public.document_ingest_items
         SET status = 'na_pregledu',
             updated_at = now()
       WHERE id = ANY(v_item_ids)
         AND owner_user_id = v_uid
         AND status = 'povezan'
         AND NOT EXISTS (
           SELECT 1 FROM public.imported_statements s
            WHERE s.source_document_item_id = public.document_ingest_items.id
         )
      RETURNING id
    )
    SELECT COUNT(*) INTO v_released FROM rel;
  END IF;

  IF v_unmerged = 0 AND v_deleted = 0 AND v_transfers = 0 AND NOT v_freed_fp THEN
    RETURN jsonb_build_object(
      'already_undone', true,
      'deleted', 0,
      'unmerged', 0,
      'transfers', 0,
      'freed_fingerprint', false,
      'documents_released', 0
    );
  END IF;

  BEGIN
    INSERT INTO public.funnel_events (user_id, event_name, metadata)
    VALUES (
      v_uid,
      'import_undone',
      jsonb_build_object(
        'batch_id', p_batch_id,
        'deleted', v_deleted,
        'unmerged', v_unmerged,
        'transfers', v_transfers,
        'freed_fingerprint', v_freed_fp,
        'had_bank_anchor', COALESCE(v_had_bank_anchor, false),
        'documents_released', v_released,
        'source_ids', COALESCE(to_jsonb(v_source_ids), '[]'::jsonb)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'already_undone', false,
    'deleted', v_deleted,
    'unmerged', v_unmerged,
    'transfers', v_transfers,
    'freed_fingerprint', v_freed_fp,
    'had_bank_anchor', COALESCE(v_had_bank_anchor, false),
    'documents_released', v_released
  );
END;
$function$;

-- 2) Označavanje 'povezan' SAMO kad uvoz stvarno postoji i pokazuje na dokument.
CREATE OR REPLACE FUNCTION public.mail_item_mark_linked(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT status INTO v_status
    FROM public.document_ingest_items
   WHERE id = p_item_id AND owner_user_id = v_uid;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_pronaden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.imported_statements s
     WHERE s.source_document_item_id = p_item_id AND s.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uvoz_ne_postoji');
  END IF;

  IF v_status = 'povezan' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'vec_povezan');
  END IF;

  UPDATE public.document_ingest_items
     SET status = 'povezan', updated_at = now()
   WHERE id = p_item_id AND owner_user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 3) Oslobađanje dokumenta koji lažno tvrdi da je povezan.
CREATE OR REPLACE FUNCTION public.mail_item_release_linked(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT status INTO v_status
    FROM public.document_ingest_items
   WHERE id = p_item_id AND owner_user_id = v_uid;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_pronaden');
  END IF;
  IF v_status <> 'povezan' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.imported_statements s
     WHERE s.source_document_item_id = p_item_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uvoz_postoji');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_links l
     WHERE l.item_id = p_item_id
       AND (
         (l.target_type = 'imported_statement'
            AND EXISTS (SELECT 1 FROM public.imported_statements s WHERE s.id = l.target_id))
         OR (l.target_type = 'incoming_invoice'
            AND EXISTS (SELECT 1 FROM public.incoming_invoices i WHERE i.id = l.target_id))
       )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uvoz_postoji');
  END IF;

  DELETE FROM public.document_links WHERE item_id = p_item_id;

  UPDATE public.document_ingest_items
     SET status = 'na_pregledu', updated_at = now()
   WHERE id = p_item_id AND owner_user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 4) Popis dokumenata koji tvrde da su povezani, a iza njih nema nijednog uvoza.
CREATE OR REPLACE FUNCTION public.mail_items_stuck_linked()
 RETURNS TABLE (
   id uuid,
   classification text,
   subject text,
   extraction jsonb,
   updated_at timestamptz
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.classification, m.subject, d.extraction, d.updated_at
    FROM public.document_ingest_items d
    LEFT JOIN public.inbound_messages m ON m.id = d.message_id
   WHERE d.owner_user_id = auth.uid()
     AND d.status = 'povezan'
     AND NOT EXISTS (
       SELECT 1 FROM public.imported_statements s WHERE s.source_document_item_id = d.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.document_links l
        WHERE l.item_id = d.id
          AND (
            (l.target_type = 'imported_statement'
               AND EXISTS (SELECT 1 FROM public.imported_statements s WHERE s.id = l.target_id))
            OR (l.target_type = 'incoming_invoice'
               AND EXISTS (SELECT 1 FROM public.incoming_invoices i WHERE i.id = l.target_id))
          )
     )
   ORDER BY d.updated_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.mail_item_mark_linked(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mail_item_release_linked(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mail_items_stuck_linked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_item_mark_linked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_item_release_linked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_items_stuck_linked() TO authenticated;