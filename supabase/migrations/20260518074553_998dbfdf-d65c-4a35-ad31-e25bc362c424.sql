ALTER TABLE public.project_invoices
  ADD COLUMN IF NOT EXISTS pdf_path text;