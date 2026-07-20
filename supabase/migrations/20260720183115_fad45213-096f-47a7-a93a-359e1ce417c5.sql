-- import_transfer_rules — user-scoped pravila za automatsko prepoznavanje internih
-- prijenosa kod uvoza bankovnog izvoda. Rule engine ih čita prije klasifikatora
-- i, ako pogodi, red se rutira kroz "Prijenosi" sekciju review dijaloga.
--
-- Ključ pravila: (user_id, merchant_key, source_wallet_key). Isti trgovac s
-- drugog izvornog novčanika NIJE isto pravilo — Milanova odluka, sprječava lažne
-- pozitive kada isti merchant naplaćuje s više kartica.
--
-- ROLLBACK (ručno, samo ako trebamo poništiti ovu migraciju):
--   DROP TABLE IF EXISTS public.import_transfer_rules CASCADE;

CREATE TABLE public.import_transfer_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  source_wallet_key TEXT NOT NULL,
  target_income_source_id UUID NOT NULL,
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT import_transfer_rules_unique_key
    UNIQUE (user_id, merchant_key, source_wallet_key)
);

CREATE INDEX idx_import_transfer_rules_user ON public.import_transfer_rules(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_transfer_rules TO authenticated;
GRANT ALL ON public.import_transfer_rules TO service_role;

ALTER TABLE public.import_transfer_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own transfer rules"
  ON public.import_transfer_rules
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_import_transfer_rules_updated_at
  BEFORE UPDATE ON public.import_transfer_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();