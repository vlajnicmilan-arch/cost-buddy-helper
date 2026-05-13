
-- Extend existing bank_connections table
ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS business_profile_id UUID,
  ADD COLUMN IF NOT EXISTS aspsp_country TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS state_token TEXT,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Rename bank_name -> aspsp_name semantically (keep both via view? no, just add aspsp_name copy)
ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS aspsp_name TEXT;

UPDATE public.bank_connections SET aspsp_name = bank_name WHERE aspsp_name IS NULL;

-- Loosen old status check, add 'active' alias
ALTER TABLE public.bank_connections DROP CONSTRAINT IF EXISTS bank_connections_status_check;
ALTER TABLE public.bank_connections
  ADD CONSTRAINT bank_connections_status_check
  CHECK (status IN ('pending', 'active', 'connected', 'expired', 'revoked', 'failed', 'error'));

-- Unique state_token (when present)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_connections_state_token
  ON public.bank_connections(state_token) WHERE state_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_connections_user
  ON public.bank_connections(user_id);

-- Bank accounts inside a connection
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  account_uid TEXT NOT NULL,
  iban TEXT,
  name TEXT,
  product TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  balance NUMERIC(18,2),
  balance_updated_at TIMESTAMPTZ,
  linked_payment_source_id UUID REFERENCES public.custom_payment_sources(id) ON DELETE SET NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, account_uid)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON public.bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection ON public.bank_accounts(connection_id);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own bank accounts"
  ON public.bank_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own bank accounts"
  ON public.bank_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own bank accounts"
  ON public.bank_accounts FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
