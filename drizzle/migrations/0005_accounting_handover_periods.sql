CREATE TABLE public.accounting_handover_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  invoice_count integer NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_profile_id, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_handover_periods TO authenticated;
GRANT ALL ON public.accounting_handover_periods TO service_role;

ALTER TABLE public.accounting_handover_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own handover periods select" ON public.accounting_handover_periods
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own handover periods insert" ON public.accounting_handover_periods
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own handover periods update" ON public.accounting_handover_periods
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own handover periods delete" ON public.accounting_handover_periods
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_accounting_handover_periods_profile
  ON public.accounting_handover_periods (business_profile_id, period);
