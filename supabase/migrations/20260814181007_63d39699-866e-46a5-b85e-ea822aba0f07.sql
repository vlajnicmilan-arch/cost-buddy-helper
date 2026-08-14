-- 1) Globalni prekidač (default UKLJUČENO)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS invoice_due_enabled boolean NOT NULL DEFAULT true;

-- 2) Samogašenje: račun plaćen / povezan s uplatom / obrisan -> gasi podsjetnike
CREATE OR REPLACE FUNCTION public.incoming_invoice_resolve_due_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.id;
  ELSIF TG_TABLE_NAME = 'eracun_payment_links' THEN
    v_invoice_id := NEW.invoice_id;
  ELSE
    IF NEW.paid_at IS NULL AND NEW.paid_expense_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_invoice_id := NEW.id;
  END IF;

  UPDATE public.notifications n
     SET status = 'resolved',
         read = true,
         resolved_at = now()
   WHERE n.type = 'invoice_due'
     AND n.status = 'active'
     AND (
       n.dedup_key LIKE 'invoice_due:' || v_invoice_id::text || ':%'
       OR n.data->>'invoice_id' = v_invoice_id::text
     );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.incoming_invoice_resolve_due_notifications() FROM anon;

DROP TRIGGER IF EXISTS trg_incoming_invoice_resolve_due_paid ON public.incoming_invoices;
CREATE TRIGGER trg_incoming_invoice_resolve_due_paid
AFTER UPDATE OF paid_at, paid_expense_id ON public.incoming_invoices
FOR EACH ROW
EXECUTE FUNCTION public.incoming_invoice_resolve_due_notifications();

DROP TRIGGER IF EXISTS trg_incoming_invoice_resolve_due_deleted ON public.incoming_invoices;
CREATE TRIGGER trg_incoming_invoice_resolve_due_deleted
AFTER DELETE ON public.incoming_invoices
FOR EACH ROW
EXECUTE FUNCTION public.incoming_invoice_resolve_due_notifications();

DROP TRIGGER IF EXISTS trg_eracun_link_resolve_due ON public.eracun_payment_links;
CREATE TRIGGER trg_eracun_link_resolve_due
AFTER INSERT ON public.eracun_payment_links
FOR EACH ROW
EXECUTE FUNCTION public.incoming_invoice_resolve_due_notifications();

-- 3) Retroaktivno: nijedan podsjetnik ne smije visjeti nad plaćenim/nestalim računom
UPDATE public.notifications n
   SET status = 'resolved', read = true, resolved_at = now()
 WHERE n.type = 'invoice_due'
   AND n.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM public.incoming_invoices i
      WHERE i.id::text = n.data->>'invoice_id'
        AND i.paid_at IS NULL
   );

-- 4) Dnevni prolaz (08:30 UTC)
SELECT cron.unschedule('invoice-due-reminders-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-due-reminders-daily');

SELECT cron.schedule(
  'invoice-due-reminders-daily',
  '30 8 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/invoice-due-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);