-- 1. Composite indeks za brzo dohvaćanje projektnih transakcija
CREATE INDEX IF NOT EXISTS idx_expenses_business_project_date 
  ON public.expenses (business_profile_id, project_id, date DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_project_date
  ON public.expenses (project_id, date DESC)
  WHERE project_id IS NOT NULL;

-- 2. Arhiviranje projekata
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_projects_archived 
  ON public.projects (user_id, archived_at);

-- 3. Tip rada na rashodima (za marže Materijal vs Rad)
DO $$ BEGIN
  CREATE TYPE public.expense_work_type AS ENUM ('material', 'labor', 'equipment', 'permit', 'subcontractor', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS work_type public.expense_work_type;

CREATE INDEX IF NOT EXISTS idx_expenses_work_type
  ON public.expenses (project_id, work_type)
  WHERE project_id IS NOT NULL AND work_type IS NOT NULL;

-- 4. GPS lokacija + tip dokumenta za Foto dnevnik
ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS location_coords TEXT,
  ADD COLUMN IF NOT EXISTS location_name TEXT,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS document_kind TEXT DEFAULT 'document' CHECK (document_kind IN ('document', 'progress_photo', 'receipt'));

CREATE INDEX IF NOT EXISTS idx_project_documents_kind
  ON public.project_documents (project_id, document_kind, created_at DESC);