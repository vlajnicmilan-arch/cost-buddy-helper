ALTER TABLE public.incoming_invoices
  ADD COLUMN accounting_category text,
  ADD COLUMN accounting_category_source text,
  ADD COLUMN accounting_category_set_at timestamptz,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.incoming_invoices
  ADD CONSTRAINT incoming_invoices_accounting_category_check
  CHECK (accounting_category IS NULL OR accounting_category IN ('project', 'tool', 'fixed_asset')),
  ADD CONSTRAINT incoming_invoices_accounting_category_source_check
  CHECK (accounting_category_source IS NULL OR accounting_category_source IN ('ai', 'user'));

CREATE INDEX incoming_invoices_project_id_idx ON public.incoming_invoices (project_id) WHERE project_id IS NOT NULL;