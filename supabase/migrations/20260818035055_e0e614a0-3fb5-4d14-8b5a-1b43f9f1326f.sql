ALTER TABLE public.imported_statements
  ADD COLUMN IF NOT EXISTS source_document_item_id uuid
  REFERENCES public.document_ingest_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_imported_statements_source_document_item
  ON public.imported_statements (source_document_item_id)
  WHERE source_document_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_mail_statement_after_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.document_ingest_items AS item
     SET status = 'povezan',
         updated_at = now()
    FROM public.inbound_attachments AS attachment
   WHERE item.attachment_id = attachment.id
     AND item.owner_user_id = NEW.user_id
     AND item.status IN ('na_pregledu', 'ceka_prvi_mail')
     AND NEW.file_hash IS NOT NULL
     AND attachment.content_sha256 = NEW.file_hash;

  IF NEW.source_document_item_id IS NOT NULL THEN
    UPDATE public.document_ingest_items AS item
       SET status = 'povezan',
           updated_at = now()
     WHERE item.id = NEW.source_document_item_id
       AND item.owner_user_id = NEW.user_id
       AND item.status IN ('na_pregledu', 'ceka_prvi_mail');
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_mail_statement_after_import() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_link_mail_statement_after_import ON public.imported_statements;
CREATE TRIGGER trg_link_mail_statement_after_import
AFTER INSERT ON public.imported_statements
FOR EACH ROW
EXECUTE FUNCTION public.link_mail_statement_after_import();