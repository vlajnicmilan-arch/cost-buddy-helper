
-- =========================================
-- 1) PROJECT TEMPLATES
-- =========================================
CREATE TABLE public.project_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  category TEXT,
  default_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public templates or own"
  ON public.project_templates FOR SELECT
  TO authenticated
  USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "Users can create own templates"
  ON public.project_templates FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own templates"
  ON public.project_templates FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can update public templates"
  ON public.project_templates FOR UPDATE
  TO authenticated
  USING (is_public = true AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own templates"
  ON public.project_templates FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER update_project_templates_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 5 public templates
INSERT INTO public.project_templates (name, description, icon, color, category, default_milestones, is_public) VALUES
('Renovacija kuhinje', 'Kompletna obnova kuhinje', '🍳', '#f59e0b', 'renovation',
 '[{"name":"Demontaža stare kuhinje","order":1,"days_offset":0},{"name":"Vodoinstalacije i elektrika","order":2,"days_offset":3},{"name":"Pločice i pod","order":3,"days_offset":7},{"name":"Montaža kuhinje","order":4,"days_offset":14},{"name":"Bijela tehnika","order":5,"days_offset":18},{"name":"Završno čišćenje","order":6,"days_offset":21}]'::jsonb, true),
('Renovacija kupaonice', 'Kompletna obnova kupaonice', '🚿', '#0ea5e9', 'renovation',
 '[{"name":"Demontaža","order":1,"days_offset":0},{"name":"Vodoinstalacije","order":2,"days_offset":2},{"name":"Hidroizolacija","order":3,"days_offset":5},{"name":"Pločice","order":4,"days_offset":8},{"name":"Sanitarije","order":5,"days_offset":14},{"name":"Završni radovi","order":6,"days_offset":18}]'::jsonb, true),
('Izgradnja krovišta', 'Postavljanje novog krovišta', '🏠', '#dc2626', 'construction',
 '[{"name":"Skidanje starog krova","order":1,"days_offset":0},{"name":"Drvena konstrukcija","order":2,"days_offset":3},{"name":"Hidroizolacija i folija","order":3,"days_offset":7},{"name":"Crijep","order":4,"days_offset":10},{"name":"Limarski radovi","order":5,"days_offset":15},{"name":"Završno","order":6,"days_offset":18}]'::jsonb, true),
('Adaptacija stana', 'Generalna adaptacija stambenog prostora', '🏢', '#8b5cf6', 'renovation',
 '[{"name":"Rušenje pregradnih zidova","order":1,"days_offset":0},{"name":"Elektroinstalacije","order":2,"days_offset":5},{"name":"Vodoinstalacije","order":3,"days_offset":8},{"name":"Žbukanje","order":4,"days_offset":12},{"name":"Podovi","order":5,"days_offset":20},{"name":"Bojanje","order":6,"days_offset":28},{"name":"Završno čišćenje","order":7,"days_offset":35}]'::jsonb, true),
('Generalno', 'Jednostavni projekt bez unaprijed definiranih faza', '📋', '#6b7280', 'general',
 '[]'::jsonb, true);

-- =========================================
-- 2) PROJECT DOCUMENTS
-- =========================================
CREATE TABLE public.project_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_mode TEXT NOT NULL DEFAULT 'local' CHECK (storage_mode IN ('local','cloud')),
  storage_path TEXT NOT NULL,
  ai_analysis JSONB,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_documents_project ON public.project_documents(project_id);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view project documents"
  ON public.project_documents FOR SELECT
  TO authenticated
  USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Members can insert project documents"
  ON public.project_documents FOR INSERT
  TO authenticated
  WITH CHECK (is_project_member(project_id, auth.uid()) AND uploaded_by = auth.uid());

CREATE POLICY "Members can update project documents"
  ON public.project_documents FOR UPDATE
  TO authenticated
  USING (is_project_member(project_id, auth.uid()))
  WITH CHECK (is_project_member(project_id, auth.uid()));

CREATE POLICY "Uploader or owner can delete documents"
  ON public.project_documents FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid() OR is_project_owner(project_id, auth.uid()));

CREATE TRIGGER update_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for cloud-mode documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: path convention {project_id}/{filename}
CREATE POLICY "Project members can read project documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "Project members can upload project documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "Project members can delete project documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND is_project_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

-- =========================================
-- 3) PROJECT ESTIMATES (Ponude / Predračuni)
-- =========================================
CREATE TABLE public.project_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_profile_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  estimate_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_oib TEXT,
  client_address TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected')),
  valid_until DATE,
  notes TEXT,
  accepted_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_estimates_business ON public.project_estimates(business_profile_id);

ALTER TABLE public.project_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own estimates"
  ON public.project_estimates FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_project_estimates_updated_at
  BEFORE UPDATE ON public.project_estimates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
