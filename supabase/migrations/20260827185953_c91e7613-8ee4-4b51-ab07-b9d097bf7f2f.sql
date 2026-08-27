CREATE TABLE public.newsletter_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  consent_text text NOT NULL,
  locale text NOT NULL,
  source text NOT NULL DEFAULT 'registracija',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX newsletter_consents_user_id_idx ON public.newsletter_consents (user_id);
CREATE INDEX newsletter_consents_email_idx ON public.newsletter_consents (email);

GRANT SELECT, INSERT, UPDATE ON public.newsletter_consents TO authenticated;
GRANT ALL ON public.newsletter_consents TO service_role;

ALTER TABLE public.newsletter_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own newsletter consents"
  ON public.newsletter_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own newsletter consents"
  ON public.newsletter_consents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can revoke own newsletter consents"
  ON public.newsletter_consents FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);