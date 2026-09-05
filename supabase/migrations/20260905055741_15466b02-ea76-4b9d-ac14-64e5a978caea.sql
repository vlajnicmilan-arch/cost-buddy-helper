-- Provjera: postoji li već uvoz s istim otiskom privitka?
CREATE OR REPLACE FUNCTION public.mail_item_existing_import(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_attachment uuid;
  v_sha text;
  v_candidates int := 0;
  v_id uuid;
  v_imported_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT d.status, d.attachment_id INTO v_status, v_attachment
    FROM public.document_ingest_items d
   WHERE d.id = p_item_id AND d.owner_user_id = v_uid;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_pronaden');
  END IF;
  IF v_status <> 'na_pregledu' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;
  IF v_attachment IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nema_otiska');
  END IF;

  SELECT a.content_sha256 INTO v_sha
    FROM public.inbound_attachments a WHERE a.id = v_attachment;

  IF v_sha IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nema_otiska');
  END IF;

  SELECT count(*) INTO v_candidates
    FROM public.imported_statements s
   WHERE s.file_hash = v_sha AND s.user_id = v_uid;

  SELECT s.id, s.imported_at INTO v_id, v_imported_at
    FROM public.imported_statements s
   WHERE s.file_hash = v_sha
     AND s.user_id = v_uid
     AND (s.source_document_item_id IS NULL OR s.source_document_item_id = p_item_id)
   ORDER BY s.created_at ASC
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'found', false,
      'reason', CASE WHEN v_candidates > 0 THEN 'uvoz_vezan_na_drugi_dokument' ELSE 'nema_postojeceg_uvoza' END,
      'candidates', v_candidates, 'content_sha256', v_sha
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'found', true,
    'statement_id', v_id,
    'imported_at', v_imported_at,
    'candidates', v_candidates,
    'content_sha256', v_sha
  );
END;
$function$;

-- Upis veze dokument -> postojeći uvoz. NE dira expenses/salda/import_batch_id.
CREATE OR REPLACE FUNCTION public.mail_item_link_existing_import(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_attachment uuid;
  v_sha text;
  v_candidates int := 0;
  v_id uuid;
  v_imported_at timestamptz;
  v_updated int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT d.status, d.attachment_id INTO v_status, v_attachment
    FROM public.document_ingest_items d
   WHERE d.id = p_item_id AND d.owner_user_id = v_uid;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_pronaden');
  END IF;
  IF v_status <> 'na_pregledu' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;
  IF v_attachment IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nema_otiska');
  END IF;

  SELECT a.content_sha256 INTO v_sha
    FROM public.inbound_attachments a WHERE a.id = v_attachment;
  IF v_sha IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nema_otiska');
  END IF;

  SELECT count(*) INTO v_candidates
    FROM public.imported_statements s
   WHERE s.file_hash = v_sha AND s.user_id = v_uid;

  SELECT s.id, s.imported_at INTO v_id, v_imported_at
    FROM public.imported_statements s
   WHERE s.file_hash = v_sha
     AND s.user_id = v_uid
     AND (s.source_document_item_id IS NULL OR s.source_document_item_id = p_item_id)
   ORDER BY s.created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN v_candidates > 0 THEN 'uvoz_vezan_na_drugi_dokument' ELSE 'nema_postojeceg_uvoza' END,
      'candidates', v_candidates,
      'content_sha256', v_sha
    );
  END IF;

  UPDATE public.imported_statements
     SET source_document_item_id = p_item_id
   WHERE id = v_id
     AND user_id = v_uid
     AND (source_document_item_id IS NULL OR source_document_item_id = p_item_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'uvoz_vezan_na_drugi_dokument',
      'candidates', v_candidates, 'content_sha256', v_sha);
  END IF;

  INSERT INTO public.document_links (item_id, target_type, target_id)
  VALUES (p_item_id, 'imported_statement', v_id)
  ON CONFLICT (item_id) DO UPDATE
    SET target_type = EXCLUDED.target_type, target_id = EXCLUDED.target_id;

  UPDATE public.document_ingest_items
     SET status = 'povezan', updated_at = now()
   WHERE id = p_item_id AND owner_user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'statement_id', v_id, 'imported_at', v_imported_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_item_existing_import(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mail_item_link_existing_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_item_existing_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_item_link_existing_import(uuid) TO authenticated;