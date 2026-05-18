ALTER TABLE public.project_invoices
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS auto_reminders_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.project_invoices(id) ON DELETE CASCADE,
  stage integer NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('manual','auto')),
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  message_id text,
  UNIQUE (invoice_id, stage, trigger)
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice ON public.invoice_reminders(invoice_id);

ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view invoice reminders"
  ON public.invoice_reminders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_invoices pi
    WHERE pi.id = invoice_reminders.invoice_id AND pi.user_id = auth.uid()
  ));

CREATE POLICY "Owner can insert invoice reminders"
  ON public.invoice_reminders FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_invoices pi
    WHERE pi.id = invoice_reminders.invoice_id AND pi.user_id = auth.uid()
  ));

-- Private storage bucket for invoice PDFs (sent via signed URL in email)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owner reads own invoice PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner uploads invoice PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner deletes own invoice PDFs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);