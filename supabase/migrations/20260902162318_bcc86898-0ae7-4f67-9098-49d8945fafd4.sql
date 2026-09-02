CREATE TABLE public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tos_version text NOT NULL,
  accepted_text text NOT NULL,
  locale text NOT NULL,
  source text NOT NULL DEFAULT 'registracija',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_terms_acceptances_user_accepted_at
  ON public.terms_acceptances (user_id, accepted_at DESC);

GRANT SELECT, INSERT ON public.terms_acceptances TO authenticated;
GRANT ALL ON public.terms_acceptances TO service_role;

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own terms acceptance"
  ON public.terms_acceptances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own terms acceptance"
  ON public.terms_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);