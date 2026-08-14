-- 1) Samogašenje: kad stavka napusti 'na_pregledu', ugasi njezinu obavijest.
CREATE OR REPLACE FUNCTION public.mail_resolve_pending_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'na_pregledu' THEN
    UPDATE public.notifications n
       SET status = 'resolved',
           read = true,
           resolved_at = now()
     WHERE n.type = 'mail_document_pending'
       AND n.status = 'active'
       AND (
         n.dedup_key = 'mail_document_pending:' || NEW.id::text
         OR n.data->>'item_id' = NEW.id::text
       );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mail_resolve_pending_notification() FROM anon;

DROP TRIGGER IF EXISTS trg_mail_resolve_pending_notification ON public.document_ingest_items;
CREATE TRIGGER trg_mail_resolve_pending_notification
AFTER UPDATE OF status ON public.document_ingest_items
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.mail_resolve_pending_notification();

-- 2) Retroaktivno: zatvori viseće obavijesti bez žive 'na_pregledu' stavke.
UPDATE public.notifications n
   SET status = 'resolved',
       read = true,
       resolved_at = now()
 WHERE n.type = 'mail_document_pending'
   AND n.status = 'active'
   AND NOT EXISTS (
     SELECT 1
       FROM public.document_ingest_items d
      WHERE d.id::text = n.data->>'item_id'
        AND d.status = 'na_pregledu'
   );

-- 3) Postojećim obavijestima dodaj dedup oznaku (samo tamo gdje ne stvara sudar).
UPDATE public.notifications n
   SET dedup_key = 'mail_document_pending:' || (n.data->>'item_id')
 WHERE n.type = 'mail_document_pending'
   AND n.dedup_key IS NULL
   AND n.data->>'item_id' IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.notifications x
      WHERE x.user_id = n.user_id
        AND x.status = 'active'
        AND x.dedup_key = 'mail_document_pending:' || (n.data->>'item_id')
   );