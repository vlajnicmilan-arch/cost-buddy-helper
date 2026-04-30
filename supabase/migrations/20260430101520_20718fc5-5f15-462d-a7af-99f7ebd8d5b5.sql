CREATE TABLE public.dpa_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'dpa',
  company_name text NOT NULL,
  company_oib text,
  company_address text,
  contact_email text,
  language text NOT NULL DEFAULT 'hr',
  generated_at timestamptz NOT NULL DEFAULT now(),
  download_count integer NOT NULL DEFAULT 1,
  CONSTRAINT dpa_requests_doc_type_check CHECK (document_type IN ('dpa', 'privacy_notice')),
  CONSTRAINT dpa_requests_lang_check CHECK (language IN ('hr', 'en', 'de'))
);

ALTER TABLE public.dpa_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_dpa" ON public.dpa_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_dpa" ON public.dpa_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_select_all_dpa" ON public.dpa_requests
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_dpa_requests_user_id ON public.dpa_requests(user_id);
CREATE INDEX idx_dpa_requests_generated_at ON public.dpa_requests(generated_at DESC);