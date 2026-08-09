CREATE TABLE public.mail_statement_source_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_iban text NOT NULL,
  bank_name text,
  payment_source_id uuid REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  confirmed_count integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_statement_source_map_unique UNIQUE (user_id, account_iban)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_statement_source_map TO authenticated;
GRANT ALL ON public.mail_statement_source_map TO service_role;

ALTER TABLE public.mail_statement_source_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own statement source rules"
  ON public.mail_statement_source_map
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_mail_statement_source_map_user_iban
  ON public.mail_statement_source_map (user_id, account_iban);

CREATE TRIGGER mail_statement_source_map_touch
  BEFORE UPDATE ON public.mail_statement_source_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();