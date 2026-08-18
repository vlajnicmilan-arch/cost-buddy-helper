CREATE OR REPLACE FUNCTION public.link_mail_statement_after_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  WITH candidates AS (
    SELECT item.id
      FROM public.document_ingest_items AS item
      JOIN public.inbound_attachments AS attachment
        ON attachment.id = item.attachment_id
     WHERE item.owner_user_id = NEW.user_id
       AND item.status IN ('na_pregledu', 'ceka_prvi_mail')
       AND NEW.file_hash IS NOT NULL
       AND attachment.content_sha256 = NEW.file_hash
    UNION
    SELECT item.id
      FROM public.document_ingest_items AS item
     WHERE NEW.source_document_item_id IS NOT NULL
       AND item.id = NEW.source_document_item_id
       AND item.owner_user_id = NEW.user_id
       AND item.status IN ('na_pregledu', 'ceka_prvi_mail')
  ), linked AS (
    INSERT INTO public.document_links (item_id, target_type, target_id)
    SELECT id, 'imported_statement', NEW.id
      FROM candidates
    ON CONFLICT (item_id) DO NOTHING
    RETURNING item_id
  )
  UPDATE public.document_ingest_items AS item
     SET status = 'povezan',
         updated_at = now()
   WHERE item.id IN (SELECT item_id FROM linked)
     AND item.status IN ('na_pregledu', 'ceka_prvi_mail');

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_mail_statement_after_import() FROM PUBLIC, anon, authenticated;