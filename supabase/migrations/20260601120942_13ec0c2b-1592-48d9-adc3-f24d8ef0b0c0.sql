
-- ============================================================
-- FAZA 2 FAMILY MODUL — KORAK 1: SCHEMA
-- ============================================================

-- 1) expenses: privacy + per-transaction split overrides
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_overrides jsonb;

CREATE INDEX IF NOT EXISTS idx_expenses_private
  ON public.expenses (user_id)
  WHERE is_private = true;

-- 2) family_members: consent + declared income + monthly contribution
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS income_share_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS income_share_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS declared_monthly_income numeric,
  ADD COLUMN IF NOT EXISTS declared_income_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS monthly_contribution numeric NOT NULL DEFAULT 0;

-- 3) family_groups: split mode + source + categories + currency
ALTER TABLE public.family_groups
  ADD COLUMN IF NOT EXISTS split_mode text NOT NULL DEFAULT 'equal',
  ADD COLUMN IF NOT EXISTS split_income_source text NOT NULL DEFAULT 'hybrid',
  ADD COLUMN IF NOT EXISTS shared_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_groups_split_mode_check') THEN
    ALTER TABLE public.family_groups
      ADD CONSTRAINT family_groups_split_mode_check
      CHECK (split_mode IN ('equal','proportional_income','manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'family_groups_split_income_source_check') THEN
    ALTER TABLE public.family_groups
      ADD CONSTRAINT family_groups_split_income_source_check
      CHECK (split_income_source IN ('auto_3m','declared','hybrid'));
  END IF;
END $$;

-- ============================================================
-- 4) family_settlements — "tko kome duguje" evidencija
-- ============================================================
CREATE TABLE IF NOT EXISTS public.family_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  debtor_user_id uuid NOT NULL,
  creditor_user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','canceled')),
  payment_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  paid_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_settlements_group_period
  ON public.family_settlements (group_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_family_settlements_debtor ON public.family_settlements (debtor_user_id);
CREATE INDEX IF NOT EXISTS idx_family_settlements_creditor ON public.family_settlements (creditor_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_settlements TO authenticated;
GRANT ALL ON public.family_settlements TO service_role;

ALTER TABLE public.family_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view settlements"
  ON public.family_settlements FOR SELECT TO authenticated
  USING (public.is_family_member(group_id, auth.uid()));

CREATE POLICY "Owner or party can insert settlement"
  ON public.family_settlements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_family_owner(group_id, auth.uid())
    OR auth.uid() = debtor_user_id
    OR auth.uid() = creditor_user_id
  );

CREATE POLICY "Owner or party can update settlement"
  ON public.family_settlements FOR UPDATE TO authenticated
  USING (
    public.is_family_owner(group_id, auth.uid())
    OR auth.uid() = debtor_user_id
    OR auth.uid() = creditor_user_id
  );

CREATE POLICY "Owner can delete settlement"
  ON public.family_settlements FOR DELETE TO authenticated
  USING (public.is_family_owner(group_id, auth.uid()));

CREATE TRIGGER trg_family_settlements_updated_at
  BEFORE UPDATE ON public.family_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5) family_split_audit — trag svih bitnih promjena
-- ============================================================
CREATE TABLE IF NOT EXISTS public.family_split_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN (
    'mode_change','override_applied','override_removed',
    'consent_granted','consent_revoked',
    'income_updated','member_exit','settings_changed'
  )),
  entity_type text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_split_audit_group_created
  ON public.family_split_audit (group_id, created_at DESC);

GRANT SELECT ON public.family_split_audit TO authenticated;
GRANT ALL ON public.family_split_audit TO service_role;

ALTER TABLE public.family_split_audit ENABLE ROW LEVEL SECURITY;

-- Members see audit (transparency); writes go ONLY through SECURITY DEFINER RPCs/triggers
CREATE POLICY "Members can view audit"
  ON public.family_split_audit FOR SELECT TO authenticated
  USING (public.is_family_member(group_id, auth.uid()));

-- ============================================================
-- 6) family_split_snapshots — kešir izračuna po razdoblju i članu
-- ============================================================
CREATE TABLE IF NOT EXISTS public.family_split_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  member_user_id uuid NOT NULL,
  shared_total numeric NOT NULL DEFAULT 0,
  share_ratio numeric NOT NULL DEFAULT 0,
  owed numeric NOT NULL DEFAULT 0,
  paid numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, period_start, period_end, member_user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_split_snapshots_lookup
  ON public.family_split_snapshots (group_id, period_start, period_end);

GRANT SELECT ON public.family_split_snapshots TO authenticated;
GRANT ALL ON public.family_split_snapshots TO service_role;

ALTER TABLE public.family_split_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view snapshots"
  ON public.family_split_snapshots FOR SELECT TO authenticated
  USING (public.is_family_member(group_id, auth.uid()));

-- ============================================================
-- 7) Audit triggeri
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_family_group_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.split_mode IS DISTINCT FROM OLD.split_mode
     OR NEW.split_income_source IS DISTINCT FROM OLD.split_income_source
     OR NEW.shared_categories IS DISTINCT FROM OLD.shared_categories
     OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    INSERT INTO public.family_split_audit (
      group_id, user_id, action, entity_type, entity_id, before_data, after_data
    ) VALUES (
      NEW.id, COALESCE(auth.uid(), NEW.user_id),
      CASE WHEN NEW.split_mode IS DISTINCT FROM OLD.split_mode THEN 'mode_change' ELSE 'settings_changed' END,
      'family_groups', NEW.id,
      jsonb_build_object(
        'split_mode', OLD.split_mode,
        'split_income_source', OLD.split_income_source,
        'shared_categories', OLD.shared_categories,
        'currency', OLD.currency
      ),
      jsonb_build_object(
        'split_mode', NEW.split_mode,
        'split_income_source', NEW.split_income_source,
        'shared_categories', NEW.shared_categories,
        'currency', NEW.currency
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_family_group_changes ON public.family_groups;
CREATE TRIGGER trg_audit_family_group_changes
  AFTER UPDATE ON public.family_groups
  FOR EACH ROW EXECUTE FUNCTION public.audit_family_group_changes();

CREATE OR REPLACE FUNCTION public.audit_family_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
BEGIN
  IF NEW.income_share_consent IS DISTINCT FROM OLD.income_share_consent THEN
    v_action := CASE WHEN NEW.income_share_consent THEN 'consent_granted' ELSE 'consent_revoked' END;
    INSERT INTO public.family_split_audit (group_id, user_id, action, entity_type, entity_id, before_data, after_data)
    VALUES (NEW.group_id, NEW.user_id, v_action, 'family_members', NEW.id,
            jsonb_build_object('consent', OLD.income_share_consent),
            jsonb_build_object('consent', NEW.income_share_consent, 'consent_at', NEW.income_share_consent_at));
  END IF;

  IF NEW.declared_monthly_income IS DISTINCT FROM OLD.declared_monthly_income
     OR NEW.declared_income_currency IS DISTINCT FROM OLD.declared_income_currency
     OR NEW.monthly_contribution IS DISTINCT FROM OLD.monthly_contribution THEN
    INSERT INTO public.family_split_audit (group_id, user_id, action, entity_type, entity_id, before_data, after_data)
    VALUES (NEW.group_id, NEW.user_id, 'income_updated', 'family_members', NEW.id,
            jsonb_build_object(
              'declared_monthly_income', OLD.declared_monthly_income,
              'declared_income_currency', OLD.declared_income_currency,
              'monthly_contribution', OLD.monthly_contribution
            ),
            jsonb_build_object(
              'declared_monthly_income', NEW.declared_monthly_income,
              'declared_income_currency', NEW.declared_income_currency,
              'monthly_contribution', NEW.monthly_contribution
            ));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_family_member_changes ON public.family_members;
CREATE TRIGGER trg_audit_family_member_changes
  AFTER UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_family_member_changes();

-- Member exit (DELETE) → audit
CREATE OR REPLACE FUNCTION public.audit_family_member_exit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.family_split_audit (group_id, user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (OLD.group_id, OLD.user_id, 'member_exit', 'family_members', OLD.id,
          jsonb_build_object('role', OLD.role, 'consent', OLD.income_share_consent),
          NULL);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_family_member_exit ON public.family_members;
CREATE TRIGGER trg_audit_family_member_exit
  BEFORE DELETE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_family_member_exit();
