-- GENERATED from live schema on 2026-08-02; see role_write_matrix.sql header.
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='admin_grant_module') THEN CREATE TYPE public.admin_grant_module AS ENUM ('projects', 'business'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='admin_grant_reason_code') THEN CREATE TYPE public.admin_grant_reason_code AS ENUM ('refund', 'beta_tester', 'internal', 'partner', 'support', 'other'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='admin_revoke_actor') THEN CREATE TYPE public.admin_revoke_actor AS ENUM ('admin', 'system'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='anchor_source_type') THEN CREATE TYPE public.anchor_source_type AS ENUM ('user_confirmed', 'migration', 'bank_reconciliation', 'system_initial'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='app_role') THEN CREATE TYPE public.app_role AS ENUM ('admin', 'user'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='expense_work_type') THEN CREATE TYPE public.expense_work_type AS ENUM ('material', 'labor', 'equipment', 'permit', 'subcontractor', 'other'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='income_source_role') THEN CREATE TYPE public.income_source_role AS ENUM ('owner', 'member'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='krug_lifecycle_state') THEN CREATE TYPE public.krug_lifecycle_state AS ENUM ('active', 'early_signal', 'ugrozen', 'continuity_window', 'read_only', 'deleted'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='krug_membership_role') THEN CREATE TYPE public.krug_membership_role AS ENUM ('punopravni', 'obicni'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='krug_override_status') THEN CREATE TYPE public.krug_override_status AS ENUM ('pending', 'potvrdjena', 'povucena', 'odbijena'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='krug_preset') THEN CREATE TYPE public.krug_preset AS ENUM ('partner', 'su_roditelj', 'cimer', 'putovanje', 'projekt', 'klub'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='krug_privacy') THEN CREATE TYPE public.krug_privacy AS ENUM ('personal', 'private', 'shared'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='krug_shared_status') THEN CREATE TYPE public.krug_shared_status AS ENUM ('predlozena', 'potvrdjena', 'nepotvrdjena'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='krug_split_mode') THEN CREATE TYPE public.krug_split_mode AS ENUM ('equal', 'proportional_income', 'manual'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='milestone_revision_coverage') THEN CREATE TYPE public.milestone_revision_coverage AS ENUM ('increase_total', 'transfer', 'contingency'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='milestone_revision_type') THEN CREATE TYPE public.milestone_revision_type AS ENUM ('overrun', 'saving', 'scope_change', 'correction'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='milestone_status') THEN CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='project_role') THEN CREATE TYPE public.project_role AS ENUM ('manager', 'member', 'viewer'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='project_status') THEN CREATE TYPE public.project_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='reconciliation_state_type') THEN CREATE TYPE public.reconciliation_state_type AS ENUM ('pending', 'aligned', 'user_override', 'skipped'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='subscription_tier') THEN CREATE TYPE public.subscription_tier AS ENUM ('free', 'pro', 'business'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='transaction_status') THEN CREATE TYPE public.transaction_status AS ENUM ('pending', 'approved', 'rejected'); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  user_email text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  reason text,
  status text DEFAULT 'pending'::text NOT NULL,
  cancelled_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_message text,
  stripe_subscription_cancelled boolean DEFAULT false,
  tables_purged jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.account_deletion_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS requested_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS scheduled_for timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_cancelled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tables_purged jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.activation_nudge_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  day_number integer NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.activation_nudge_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS day_number integer,
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.admin_module_grants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  module admin_grant_module NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  reason_code admin_grant_reason_code NOT NULL,
  reason_note text,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revoked_actor admin_revoke_actor,
  revoke_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.admin_module_grants
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS module admin_grant_module,
  ADD COLUMN IF NOT EXISTS granted_by uuid,
  ADD COLUMN IF NOT EXISTS granted_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reason_code admin_grant_reason_code,
  ADD COLUMN IF NOT EXISTS reason_note text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revoked_actor admin_revoke_actor,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  proposal_id uuid,
  action_type text NOT NULL,
  decision text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.ai_action_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS proposal_id uuid,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.ai_cost_monthly (
  month_key date NOT NULL,
  route text NOT NULL,
  call_count integer DEFAULT 0 NOT NULL,
  total_eur numeric(12,4) DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (month_key, route)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.ai_cost_monthly
  ADD COLUMN IF NOT EXISTS month_key date,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS call_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_eur numeric(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.ai_insights_cache (
  user_id uuid NOT NULL,
  generated_on date DEFAULT CURRENT_DATE NOT NULL,
  insights jsonb DEFAULT '[]'::jsonb NOT NULL,
  expense_count_at_generation integer DEFAULT 0 NOT NULL,
  language text DEFAULT 'hr'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, generated_on)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.ai_insights_cache
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS generated_on date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS insights jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expense_count_at_generation integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'hr'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.ai_proposed_actions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  session_id text,
  action_type text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'proposed'::text NOT NULL,
  result jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  confirmed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.ai_proposed_actions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'proposed'::text,
  ADD COLUMN IF NOT EXISTS result jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rejected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval);
CREATE TABLE IF NOT EXISTS public.ai_route_costs (
  route text NOT NULL,
  unit_cost_eur numeric(10,6) NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (route)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.ai_route_costs
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS unit_cost_eur numeric(10,6),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  user_id uuid NOT NULL,
  usage_date date DEFAULT ((now() AT TIME ZONE 'UTC'::text))::date NOT NULL,
  route text NOT NULL,
  count integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, usage_date, route)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.ai_usage_daily
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS usage_date date DEFAULT ((now() AT TIME ZONE 'UTC'::text))::date,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
  user_id uuid NOT NULL,
  usage_month date DEFAULT (date_trunc('month'::text, (now() AT TIME ZONE 'UTC'::text)))::date NOT NULL,
  count integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, usage_month)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.ai_usage_monthly
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS usage_month date DEFAULT (date_trunc('month'::text, (now() AT TIME ZONE 'UTC'::text)))::date,
  ADD COLUMN IF NOT EXISTS count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.anchor_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_id uuid NOT NULL,
  user_id uuid NOT NULL,
  old_anchor_date timestamp with time zone,
  old_anchor_balance numeric(12,2),
  old_balance numeric(12,2),
  new_anchor_date timestamp with time zone NOT NULL,
  new_anchor_balance numeric(12,2) NOT NULL,
  anchor_source anchor_source_type NOT NULL,
  reason text NOT NULL,
  actor uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.anchor_audit
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS old_anchor_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS old_anchor_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS old_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS new_anchor_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS new_anchor_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS anchor_source anchor_source_type,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS actor uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.app_diagnostics_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id text NOT NULL,
  user_id uuid,
  event text NOT NULL,
  route text,
  details jsonb,
  device_info jsonb,
  app_version text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  severity text DEFAULT 'info'::text NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.app_diagnostics_logs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS event text,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS device_info jsonb,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info'::text;
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (key)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS value jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  connection_id uuid NOT NULL,
  user_id uuid NOT NULL,
  account_uid text NOT NULL,
  iban text,
  name text,
  product text,
  currency text DEFAULT 'EUR'::text NOT NULL,
  balance numeric(18,2),
  balance_updated_at timestamp with time zone,
  linked_payment_source_id uuid,
  raw_payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  business_profile_id uuid,
  last_synced_at timestamp with time zone,
  last_sync_error text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS connection_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS account_uid text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS product text,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text,
  ADD COLUMN IF NOT EXISTS balance numeric(18,2),
  ADD COLUMN IF NOT EXISTS balance_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS linked_payment_source_id uuid,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_error text;
CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  bank_name text NOT NULL,
  account_id text,
  status text DEFAULT 'pending'::text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  business_profile_id uuid,
  aspsp_country text,
  session_id text,
  state_token text,
  valid_until timestamp with time zone,
  last_error text,
  aspsp_name text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS aspsp_country text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS state_token text,
  ADD COLUMN IF NOT EXISTS valid_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS aspsp_name text;
CREATE TABLE IF NOT EXISTS public.budget_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  budget_id uuid NOT NULL,
  category text NOT NULL,
  limit_amount numeric DEFAULT 0 NOT NULL,
  icon text,
  color text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.budget_categories
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS budget_id uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS limit_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.budget_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  budget_id uuid NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  invited_by uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  used_at timestamp with time zone,
  invited_user_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.budget_invitations
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS budget_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'::text,
  ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invited_by uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS used_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS invited_user_id uuid;
CREATE TABLE IF NOT EXISTS public.budget_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  budget_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.budget_members
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS budget_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'::text,
  ADD COLUMN IF NOT EXISTS joined_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.budget_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '💰'::text,
  color text DEFAULT '#3b82f6'::text,
  period_type text DEFAULT 'monthly'::text NOT NULL,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  total_amount numeric DEFAULT 0 NOT NULL,
  project_id uuid,
  is_recurring boolean DEFAULT true NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.budget_plans
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '💰'::text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6'::text,
  ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'monthly'::text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT true;
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  device_info jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'open'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS device_info jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.business_debts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text DEFAULT 'receivable'::text NOT NULL,
  contact_name text NOT NULL,
  description text,
  amount numeric NOT NULL,
  paid_amount numeric DEFAULT 0 NOT NULL,
  due_date date,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source_expense_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.business_debts
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'receivable'::text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_expense_id uuid;
CREATE TABLE IF NOT EXISTS public.business_premises (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text DEFAULT '1'::text NOT NULL,
  label text,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'Hrvatska'::text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.business_premises
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text DEFAULT '1'::text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Hrvatska'::text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  company_name text NOT NULL,
  oib text,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'Hrvatska'::text,
  iban text,
  bank_name text,
  email text,
  phone text,
  website text,
  logo_url text,
  is_vat_payer boolean DEFAULT false,
  vat_id text,
  activity_code text,
  activity_description text,
  mbs text,
  court_registry text,
  legal_form text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  industry_type text DEFAULT 'other'::text,
  enabled_modules text[] DEFAULT '{}'::text[],
  vat_obligation_type text DEFAULT 'non_vat'::text,
  vat_exemption_note text DEFAULT 'Obveznik nije u sustavu PDV-a, PDV nije obračunat temeljem čl. 90 st.1 Zakona o PDV-u.'::text,
  owner_name text,
  invoice_payment_days integer DEFAULT 7,
  invoice_header text,
  invoice_footer text,
  theme_color text DEFAULT 'ocean-blue'::text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS oib text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Hrvatska'::text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS is_vat_payer boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_id text,
  ADD COLUMN IF NOT EXISTS activity_code text,
  ADD COLUMN IF NOT EXISTS activity_description text,
  ADD COLUMN IF NOT EXISTS mbs text,
  ADD COLUMN IF NOT EXISTS court_registry text,
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS industry_type text DEFAULT 'other'::text,
  ADD COLUMN IF NOT EXISTS enabled_modules text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS vat_obligation_type text DEFAULT 'non_vat'::text,
  ADD COLUMN IF NOT EXISTS vat_exemption_note text DEFAULT 'Obveznik nije u sustavu PDV-a, PDV nije obračunat temeljem čl. 90 st.1 Zakona o PDV-u.'::text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS invoice_payment_days integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS invoice_header text,
  ADD COLUMN IF NOT EXISTS invoice_footer text,
  ADD COLUMN IF NOT EXISTS theme_color text DEFAULT 'ocean-blue'::text;
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_profile_id uuid NOT NULL,
  premise_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text DEFAULT '1'::text NOT NULL,
  label text,
  device_type text DEFAULT 'mob'::text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  balance numeric DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS premise_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text DEFAULT '1'::text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS device_type text DEFAULT 'mob'::text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.category_corrections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  expense_id uuid,
  original_category text NOT NULL,
  original_origin text,
  corrected_category text NOT NULL,
  description text,
  merchant_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.category_corrections
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS original_category text,
  ADD COLUMN IF NOT EXISTS original_origin text,
  ADD COLUMN IF NOT EXISTS corrected_category text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS merchant_name text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  business_profile_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  oib text,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'Hrvatska'::text,
  email text,
  phone text,
  contact_person text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS oib text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Hrvatska'::text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.company_lookup_cache (
  query_normalized text NOT NULL,
  payload jsonb NOT NULL,
  hit_count integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (query_normalized)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.company_lookup_cache
  ADD COLUMN IF NOT EXISTS query_normalized text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS hit_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.core_scan_usage (
  user_id uuid NOT NULL,
  count integer DEFAULT 0 NOT NULL,
  window_start timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.core_scan_usage
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS window_start timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.custom_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '📁'::text NOT NULL,
  color text DEFAULT '#6b7280'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.custom_categories
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '📁'::text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#6b7280'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.custom_payment_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '💳'::text NOT NULL,
  color text DEFAULT '#6b7280'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  balance numeric DEFAULT 0 NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  business_profile_id uuid,
  currency text DEFAULT 'EUR'::text,
  correction_anchor_date timestamp with time zone,
  correction_anchor_balance numeric(12,2),
  anchor_source anchor_source_type,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.custom_payment_sources
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '💳'::text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#6b7280'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text,
  ADD COLUMN IF NOT EXISTS correction_anchor_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS correction_anchor_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS anchor_source anchor_source_type;
CREATE TABLE IF NOT EXISTS public.dashboard_hidden_sources (
  user_id uuid NOT NULL,
  source_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, source_id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.dashboard_hidden_sources
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.dashboard_telemetry (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  session_id text,
  event_type text NOT NULL,
  section text NOT NULL,
  value integer,
  platform text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.dashboard_telemetry
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS value integer,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurred_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.decision_withdrawal_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  decision_id uuid NOT NULL,
  project_id uuid NOT NULL,
  created_by uuid NOT NULL,
  withdrawn_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.decision_withdrawal_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS decision_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id text,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id integer DEFAULT 1 NOT NULL,
  retry_after_until timestamp with time zone,
  batch_size integer DEFAULT 10 NOT NULL,
  send_delay_ms integer DEFAULT 200 NOT NULL,
  auth_email_ttl_minutes integer DEFAULT 15 NOT NULL,
  transactional_email_ttl_minutes integer DEFAULT 60 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.email_send_state
  ADD COLUMN IF NOT EXISTS id integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retry_after_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS batch_size integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS send_delay_ms integer DEFAULT 200,
  ADD COLUMN IF NOT EXISTS auth_email_ttl_minutes integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS transactional_email_ttl_minutes integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  used_at timestamp with time zone,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.email_unsubscribe_tokens
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS used_at timestamp with time zone;
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  description text NOT NULL,
  category text DEFAULT 'other'::text NOT NULL,
  type text DEFAULT 'expense'::text NOT NULL,
  date timestamp with time zone DEFAULT now() NOT NULL,
  receipt_url text,
  merchant_name text,
  ai_extracted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  payment_source text DEFAULT 'cash'::text,
  income_source_id uuid,
  status transaction_status DEFAULT 'approved'::transaction_status,
  submitted_by uuid,
  payment_source_card_id uuid,
  note text,
  project_id uuid,
  milestone_id uuid,
  budget_id uuid,
  expense_nature text DEFAULT 'regular'::text,
  import_batch_id uuid,
  business_profile_id uuid,
  vat_rate numeric,
  vat_amount numeric,
  cash_register_id uuid,
  currency text,
  location_name text,
  location_coords text,
  work_type expense_work_type,
  bank_transaction_id text,
  bank_account_id uuid,
  collaborator_id uuid,
  is_advance boolean DEFAULT false NOT NULL,
  linked_advance_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  invoice_id uuid,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  bank_match_status text DEFAULT 'manual'::text NOT NULL,
  possible_duplicate_of uuid,
  krug_id uuid,
  krug_privacy krug_privacy,
  krug_shared_status krug_shared_status,
  recurring_transaction_id uuid,
  event_at timestamp with time zone,
  time_confidence text DEFAULT 'C3'::text NOT NULL,
  user_edited_event_at boolean DEFAULT false NOT NULL,
  worker_payout_id uuid,
  worker_payout_batch_id uuid,
  balance_after numeric,
  bank_row_seq integer,
  category_origin text DEFAULT 'user'::text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'other'::text,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'expense'::text,
  ADD COLUMN IF NOT EXISTS date timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS merchant_name text,
  ADD COLUMN IF NOT EXISTS ai_extracted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS payment_source text DEFAULT 'cash'::text,
  ADD COLUMN IF NOT EXISTS income_source_id uuid,
  ADD COLUMN IF NOT EXISTS status transaction_status DEFAULT 'approved'::transaction_status,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS payment_source_card_id uuid,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS milestone_id uuid,
  ADD COLUMN IF NOT EXISTS budget_id uuid,
  ADD COLUMN IF NOT EXISTS expense_nature text DEFAULT 'regular'::text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS vat_rate numeric,
  ADD COLUMN IF NOT EXISTS vat_amount numeric,
  ADD COLUMN IF NOT EXISTS cash_register_id uuid,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS location_coords text,
  ADD COLUMN IF NOT EXISTS work_type expense_work_type,
  ADD COLUMN IF NOT EXISTS bank_transaction_id text,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid,
  ADD COLUMN IF NOT EXISTS collaborator_id uuid,
  ADD COLUMN IF NOT EXISTS is_advance boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_advance_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS bank_match_status text DEFAULT 'manual'::text,
  ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid,
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS krug_privacy krug_privacy,
  ADD COLUMN IF NOT EXISTS krug_shared_status krug_shared_status,
  ADD COLUMN IF NOT EXISTS recurring_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS event_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS time_confidence text DEFAULT 'C3'::text,
  ADD COLUMN IF NOT EXISTS user_edited_event_at boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS worker_payout_id uuid,
  ADD COLUMN IF NOT EXISTS worker_payout_batch_id uuid,
  ADD COLUMN IF NOT EXISTS balance_after numeric,
  ADD COLUMN IF NOT EXISTS bank_row_seq integer,
  ADD COLUMN IF NOT EXISTS category_origin text DEFAULT 'user'::text;
CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email text,
  type text NOT NULL,
  message text NOT NULL,
  rating smallint,
  route text,
  app_version text,
  user_agent text,
  language text,
  viewport text,
  platform text,
  console_tail jsonb,
  diagnostics jsonb,
  status text DEFAULT 'new'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS viewport text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS console_tail jsonb,
  ADD COLUMN IF NOT EXISTS diagnostics jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'new'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.free_tier_usage_monthly (
  user_id uuid NOT NULL,
  month_key text NOT NULL,
  transactions_created integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, month_key)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.free_tier_usage_monthly
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS month_key text,
  ADD COLUMN IF NOT EXISTS transactions_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.funnel_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  session_id text,
  event_name text NOT NULL,
  platform text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.funnel_events
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurred_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.health_summaries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  summary_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date NOT NULL,
  language text DEFAULT 'hr'::text NOT NULL,
  summary_text text NOT NULL,
  metrics_json jsonb,
  generated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.health_summaries
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS summary_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'hr'::text,
  ADD COLUMN IF NOT EXISTS summary_text text,
  ADD COLUMN IF NOT EXISTS metrics_json jsonb,
  ADD COLUMN IF NOT EXISTS generated_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.import_transfer_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  merchant_key text NOT NULL,
  source_wallet_key text NOT NULL,
  target_income_source_id uuid NOT NULL,
  times_used integer DEFAULT 0 NOT NULL,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.import_transfer_rules
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS merchant_key text,
  ADD COLUMN IF NOT EXISTS source_wallet_key text,
  ADD COLUMN IF NOT EXISTS target_income_source_id uuid,
  ADD COLUMN IF NOT EXISTS times_used integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.imported_statements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  payment_source_id uuid,
  file_hash text,
  content_hash text,
  file_name text,
  file_size bigint,
  mime_type text,
  transactions_count integer,
  import_batch_id uuid,
  imported_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  reconciliation_state reconciliation_state_type,
  reconciliation_meta jsonb,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.imported_statements
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS payment_source_id uuid,
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS transactions_count integer,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reconciliation_state reconciliation_state_type,
  ADD COLUMN IF NOT EXISTS reconciliation_meta jsonb;
CREATE TABLE IF NOT EXISTS public.income_source_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  income_source_id uuid NOT NULL,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.income_source_invitations
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS income_source_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS invited_by uuid,
  ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.income_source_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  income_source_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role income_source_role DEFAULT 'member'::income_source_role NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.income_source_members
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS income_source_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role income_source_role DEFAULT 'member'::income_source_role,
  ADD COLUMN IF NOT EXISTS joined_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.income_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '💰'::text,
  color text DEFAULT '#22c55e'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.income_sources
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '💰'::text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#22c55e'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.installment_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  description text NOT NULL,
  total_amount numeric NOT NULL,
  installment_count integer NOT NULL,
  first_payment_date date NOT NULL,
  category text DEFAULT 'other'::text NOT NULL,
  payment_source text,
  payment_source_card_id uuid,
  type text DEFAULT 'expense'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.installment_plans
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS total_amount numeric,
  ADD COLUMN IF NOT EXISTS installment_count integer,
  ADD COLUMN IF NOT EXISTS first_payment_date date,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'other'::text,
  ADD COLUMN IF NOT EXISTS payment_source text,
  ADD COLUMN IF NOT EXISTS payment_source_card_id uuid,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'expense'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.installments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  installment_number integer NOT NULL,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'planned'::text NOT NULL,
  paid_at timestamp with time zone,
  expense_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.installments
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'planned'::text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  sku text,
  category text,
  unit text DEFAULT 'kom'::text,
  purchase_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  min_quantity numeric DEFAULT 0,
  current_quantity numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'kom'::text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_quantity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_quantity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  item_id uuid NOT NULL,
  type text NOT NULL,
  quantity numeric NOT NULL,
  price numeric DEFAULT 0,
  note text,
  expense_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS item_id uuid,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  unit text DEFAULT 'kom'::text,
  unit_price numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  vat_rate numeric DEFAULT 25,
  total numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'kom'::text,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 25,
  ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.invoice_reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  stage integer NOT NULL,
  trigger text NOT NULL,
  recipient_email text NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  message_id text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.invoice_reminders
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS stage integer,
  ADD COLUMN IF NOT EXISTS trigger text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS message_id text;
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_profile_id uuid NOT NULL,
  client_id uuid,
  user_id uuid NOT NULL,
  invoice_number text NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  status text DEFAULT 'draft'::text,
  total_amount numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  notes text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  fiscalization_jir text,
  fiscalization_zki text,
  fiscalized_at timestamp with time zone,
  eracun_sent boolean DEFAULT false,
  eracun_sent_at timestamp with time zone,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS issue_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text,
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fiscalization_jir text,
  ADD COLUMN IF NOT EXISTS fiscalization_zki text,
  ADD COLUMN IF NOT EXISTS fiscalized_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS eracun_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS eracun_sent_at timestamp with time zone;
CREATE TABLE IF NOT EXISTS public.krug (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  preset krug_preset NOT NULL,
  lifecycle_state krug_lifecycle_state DEFAULT 'active'::krug_lifecycle_state NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  split_mode krug_split_mode DEFAULT 'equal'::krug_split_mode NOT NULL,
  settlement_currency text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS preset krug_preset,
  ADD COLUMN IF NOT EXISTS lifecycle_state krug_lifecycle_state DEFAULT 'active'::krug_lifecycle_state,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS split_mode krug_split_mode DEFAULT 'equal'::krug_split_mode,
  ADD COLUMN IF NOT EXISTS settlement_currency text;
CREATE TABLE IF NOT EXISTS public.krug_act_dedup (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  act text NOT NULL,
  client_request_id text NOT NULL,
  outcome text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_act_dedup
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS act text,
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_deletion_request (
  krug_id uuid NOT NULL,
  initiated_by uuid NOT NULL,
  initiated_at timestamp with time zone DEFAULT now() NOT NULL,
  reason text,
  status text DEFAULT 'pending'::text NOT NULL,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  member_snapshot uuid[],
  PRIMARY KEY (krug_id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_deletion_request
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS initiated_by uuid,
  ADD COLUMN IF NOT EXISTS initiated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS member_snapshot uuid[];
CREATE TABLE IF NOT EXISTS public.krug_deletion_vote (
  krug_id uuid NOT NULL,
  user_id uuid NOT NULL,
  approve boolean NOT NULL,
  voted_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (krug_id, user_id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_deletion_vote
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS approve boolean,
  ADD COLUMN IF NOT EXISTS voted_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_expense_split_confirmation (
  override_id uuid NOT NULL,
  user_id uuid NOT NULL,
  confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (override_id, user_id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_expense_split_confirmation
  ADD COLUMN IF NOT EXISTS override_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_expense_split_override (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  expense_id uuid NOT NULL,
  krug_id uuid NOT NULL,
  proposed_by uuid NOT NULL,
  status krug_override_status DEFAULT 'pending'::krug_override_status NOT NULL,
  activated_at timestamp with time zone,
  superseded_by uuid,
  reject_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_expense_split_override
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS proposed_by uuid,
  ADD COLUMN IF NOT EXISTS status krug_override_status DEFAULT 'pending'::krug_override_status,
  ADD COLUMN IF NOT EXISTS activated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_expense_split_share (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  override_id uuid NOT NULL,
  user_id uuid NOT NULL,
  share_percent numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_expense_split_share
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS override_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS share_percent numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_income_ratio (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  krug_id uuid NOT NULL,
  user_id uuid NOT NULL,
  weight numeric(10,4) NOT NULL,
  effective_from date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_income_ratio
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS weight numeric(10,4),
  ADD COLUMN IF NOT EXISTS effective_from date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_membership (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  krug_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role krug_membership_role NOT NULL,
  added_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_membership
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role krug_membership_role,
  ADD COLUMN IF NOT EXISTS added_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_ownership (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  krug_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_ownership
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_settlement_fx_snapshot (
  krug_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  display_currency text NOT NULL,
  rates jsonb NOT NULL,
  frozen_at timestamp with time zone DEFAULT now() NOT NULL,
  source text DEFAULT 'exchange-rates'::text NOT NULL,
  notes text,
  PRIMARY KEY (krug_id, period_start, period_end, display_currency)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_settlement_fx_snapshot
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS display_currency text,
  ADD COLUMN IF NOT EXISTS rates jsonb,
  ADD COLUMN IF NOT EXISTS frozen_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'exchange-rates'::text,
  ADD COLUMN IF NOT EXISTS notes text;
CREATE TABLE IF NOT EXISTS public.krug_settlement_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  krug_id uuid NOT NULL,
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  note text,
  marked_by uuid NOT NULL,
  marked_at timestamp with time zone DEFAULT now() NOT NULL,
  voided_at timestamp with time zone,
  voided_by uuid,
  void_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_settlement_ledger
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS from_user uuid,
  ADD COLUMN IF NOT EXISTS to_user uuid,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS marked_by uuid,
  ADD COLUMN IF NOT EXISTS marked_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS voided_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.krug_shared_payment_source (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  krug_id uuid NOT NULL,
  payment_source_id text NOT NULL,
  linked_by uuid NOT NULL,
  linked_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.krug_shared_payment_source
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS krug_id uuid,
  ADD COLUMN IF NOT EXISTS payment_source_id text,
  ADD COLUMN IF NOT EXISTS linked_by uuid,
  ADD COLUMN IF NOT EXISTS linked_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.milestone_budget_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  milestone_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  threshold integer NOT NULL,
  usage_pct numeric NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.milestone_budget_alerts
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS milestone_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS threshold integer,
  ADD COLUMN IF NOT EXISTS usage_pct numeric,
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.milestone_budget_revisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  milestone_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  previous_amount numeric DEFAULT 0 NOT NULL,
  new_amount numeric DEFAULT 0 NOT NULL,
  delta numeric GENERATED ALWAYS AS ((new_amount - previous_amount)) STORED,
  reason text NOT NULL,
  change_type milestone_revision_type,
  coverage milestone_revision_coverage DEFAULT 'increase_total'::milestone_revision_coverage NOT NULL,
  linked_milestone_id uuid,
  linked_revision_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.milestone_budget_revisions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS milestone_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS previous_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta numeric GENERATED ALWAYS AS ((new_amount - previous_amount)) STORED,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS change_type milestone_revision_type,
  ADD COLUMN IF NOT EXISTS coverage milestone_revision_coverage DEFAULT 'increase_total'::milestone_revision_coverage,
  ADD COLUMN IF NOT EXISTS linked_milestone_id uuid,
  ADD COLUMN IF NOT EXISTS linked_revision_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.milestone_checklist_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  milestone_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  is_done boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  done_at timestamp with time zone,
  done_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.milestone_checklist_items
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS milestone_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS is_done boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS done_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS done_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.monitor_alerts_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  alert_signature text NOT NULL,
  triggered_at timestamp with time zone DEFAULT now() NOT NULL,
  error_count integer DEFAULT 0 NOT NULL,
  affected_users integer DEFAULT 0 NOT NULL,
  sample_message text,
  sample_route text,
  notified boolean DEFAULT false NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  notified_email boolean DEFAULT false NOT NULL,
  source text DEFAULT 'cron'::text NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.monitor_alerts_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS alert_signature text,
  ADD COLUMN IF NOT EXISTS triggered_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affected_users integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sample_message text,
  ADD COLUMN IF NOT EXISTS sample_route text,
  ADD COLUMN IF NOT EXISTS notified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notified_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'cron'::text;
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  chat_enabled boolean DEFAULT true NOT NULL,
  transactions_enabled boolean DEFAULT true NOT NULL,
  pending_enabled boolean DEFAULT true NOT NULL,
  projects_enabled boolean DEFAULT true NOT NULL,
  budgets_enabled boolean DEFAULT true NOT NULL,
  reminders_enabled boolean DEFAULT true NOT NULL,
  trial_enabled boolean DEFAULT true NOT NULL,
  broadcast_enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  daily_summary_enabled boolean DEFAULT true NOT NULL,
  daily_summary_weekend_enabled boolean DEFAULT true NOT NULL,
  daily_summary_last_sent_on date,
  daily_summary_paused_until date,
  daily_summary_unopened_streak integer DEFAULT 0 NOT NULL,
  family_override_push boolean DEFAULT false NOT NULL,
  family_reactions_push boolean DEFAULT false NOT NULL,
  daily_summary_state jsonb DEFAULT '{}'::jsonb NOT NULL,
  participant_digest_enabled boolean DEFAULT true NOT NULL,
  participant_digest_hour smallint DEFAULT 19 NOT NULL,
  krug_enabled boolean DEFAULT true NOT NULL,
  decisions_enabled boolean DEFAULT true NOT NULL,
  krug_settlement_reminder_enabled boolean DEFAULT true NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS chat_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS transactions_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS pending_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS projects_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS budgets_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS trial_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS broadcast_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS daily_summary_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_summary_weekend_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_summary_last_sent_on date,
  ADD COLUMN IF NOT EXISTS daily_summary_paused_until date,
  ADD COLUMN IF NOT EXISTS daily_summary_unopened_streak integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS family_override_push boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS family_reactions_push boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_summary_state jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS participant_digest_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS participant_digest_hour smallint DEFAULT 19,
  ADD COLUMN IF NOT EXISTS krug_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS decisions_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS krug_settlement_reminder_enabled boolean DEFAULT true;
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  severity text DEFAULT 'info'::text NOT NULL,
  dedup_key text,
  entity_type text,
  entity_id uuid,
  resolved_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  recurrence_count integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info'::text,
  ADD COLUMN IF NOT EXISTS dedup_key text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS recurrence_count integer DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.paddle_price_map (
  price_id text NOT NULL,
  module text NOT NULL,
  billing_cycle text NOT NULL,
  environment text DEFAULT 'live'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (price_id, module)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.paddle_price_map
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS environment text DEFAULT 'live'::text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.participant_digest_state (
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  pending_count integer DEFAULT 0 NOT NULL,
  pending_summary jsonb DEFAULT '[]'::jsonb NOT NULL,
  last_event_at timestamp with time zone,
  last_sent_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.participant_digest_state
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS pending_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_summary jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_event_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.payment_source_cards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_source_id uuid NOT NULL,
  user_id uuid NOT NULL,
  card_name text DEFAULT 'Kartica'::text NOT NULL,
  last_four_digits text NOT NULL,
  card_type text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.payment_source_cards
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS payment_source_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS card_name text DEFAULT 'Kartica'::text,
  ADD COLUMN IF NOT EXISTS last_four_digits text,
  ADD COLUMN IF NOT EXISTS card_type text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.payment_source_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_source_id uuid NOT NULL,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  invited_user_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.payment_source_invitations
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS payment_source_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS invited_by uuid,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'::text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  ADD COLUMN IF NOT EXISTS used_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS invited_user_id uuid;
CREATE TABLE IF NOT EXISTS public.payment_source_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_source_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.payment_source_members
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS payment_source_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'::text,
  ADD COLUMN IF NOT EXISTS joined_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.payout_rate_segments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payout_id uuid NOT NULL,
  rate numeric(10,2) NOT NULL,
  segment_start date NOT NULL,
  segment_end date NOT NULL,
  hours numeric(10,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.payout_rate_segments
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS payout_id uuid,
  ADD COLUMN IF NOT EXISTS rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS segment_start date,
  ADD COLUMN IF NOT EXISTS segment_end date,
  ADD COLUMN IF NOT EXISTS hours numeric(10,2),
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.pdf_parse_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  result jsonb,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.pdf_parse_jobs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS result jsonb,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  display_name text,
  currency text DEFAULT 'EUR'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  multi_currency_enabled boolean DEFAULT false,
  deleted_at timestamp with time zone,
  deletion_scheduled_at timestamp with time zone,
  onboarding_completed boolean DEFAULT false NOT NULL,
  timezone text DEFAULT 'Europe/Zagreb'::text,
  preferred_language text DEFAULT 'hr'::text,
  is_e2e_user boolean DEFAULT false NOT NULL,
  guided_home_exited_at timestamp with time zone,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS multi_currency_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Zagreb'::text,
  ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'hr'::text,
  ADD COLUMN IF NOT EXISTS is_e2e_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS guided_home_exited_at timestamp with time zone;
CREATE TABLE IF NOT EXISTS public.project_activity_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid,
  action_type text NOT NULL,
  action_description text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_activity_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS action_description text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_activity_push_throttle (
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  activity_bucket text NOT NULL,
  last_sent_at timestamp with time zone DEFAULT now() NOT NULL,
  pending_count integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, project_id, activity_bucket)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_activity_push_throttle
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS activity_bucket text,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pending_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_budget_revisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  previous_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_budget_revisions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS previous_amount numeric,
  ADD COLUMN IF NOT EXISTS new_amount numeric,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  company_name text,
  service_description text NOT NULL,
  total_price numeric DEFAULT 0 NOT NULL,
  milestone_id uuid,
  status text DEFAULT 'active'::text NOT NULL,
  contact_info text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  paid_amount numeric DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_collaborators
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS service_description text,
  ADD COLUMN IF NOT EXISTS total_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS milestone_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text,
  ADD COLUMN IF NOT EXISTS contact_info text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.project_contract_amendments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amendment_amount numeric NOT NULL,
  note text,
  linked_revision_id uuid,
  linked_milestone_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source_decision_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_contract_amendments
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS amendment_amount numeric,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS linked_revision_id uuid,
  ADD COLUMN IF NOT EXISTS linked_milestone_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_decision_id uuid;
CREATE TABLE IF NOT EXISTS public.project_decision_admin_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  decision_id uuid NOT NULL,
  project_id uuid NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_by uuid NOT NULL,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_decision_admin_requests
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS decision_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_decision_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  decision_id uuid NOT NULL,
  step_id uuid,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_decision_attachments
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS decision_id uuid,
  ADD COLUMN IF NOT EXISTS step_id uuid,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes integer,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_decision_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  decision_id uuid NOT NULL,
  step_no integer NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  price numeric(14,2),
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_decision_steps
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS decision_id uuid,
  ADD COLUMN IF NOT EXISTS step_no integer,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS price numeric(14,2);
CREATE TABLE IF NOT EXISTS public.project_decisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  created_by uuid NOT NULL,
  title text NOT NULL,
  initial_description text NOT NULL,
  initial_price numeric(14,2),
  current_status text DEFAULT 'awaiting_response'::text NOT NULL,
  closed_reason text,
  closed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  contract_amendment_id uuid,
  overdue boolean DEFAULT false NOT NULL,
  last_reminder_sent_at timestamp with time zone,
  annulled_at timestamp with time zone,
  annulled_by uuid,
  annul_request_id uuid,
  annul_compensation_amendment_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_decisions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS initial_description text,
  ADD COLUMN IF NOT EXISTS initial_price numeric(14,2),
  ADD COLUMN IF NOT EXISTS current_status text DEFAULT 'awaiting_response'::text,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS contract_amendment_id uuid,
  ADD COLUMN IF NOT EXISTS overdue boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS annulled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS annulled_by uuid,
  ADD COLUMN IF NOT EXISTS annul_request_id uuid,
  ADD COLUMN IF NOT EXISTS annul_compensation_amendment_id uuid;
CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL,
  mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
  size_bytes bigint DEFAULT 0 NOT NULL,
  storage_mode text DEFAULT 'local'::text NOT NULL,
  storage_path text NOT NULL,
  ai_analysis jsonb,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  location_coords text,
  location_name text,
  captured_at timestamp with time zone,
  document_kind text DEFAULT 'document'::text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS mime_type text DEFAULT 'application/octet-stream'::text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_mode text DEFAULT 'local'::text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS location_coords text,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS captured_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS document_kind text DEFAULT 'document'::text;
CREATE TABLE IF NOT EXISTS public.project_estimates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  estimate_number text NOT NULL,
  client_name text NOT NULL,
  client_oib text,
  client_address text,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  subtotal numeric DEFAULT 0 NOT NULL,
  vat_amount numeric DEFAULT 0 NOT NULL,
  total_amount numeric DEFAULT 0 NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  valid_until date,
  notes text,
  accepted_project_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_estimates
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS estimate_number text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_oib text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS accepted_project_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE TABLE IF NOT EXISTS public.project_funding (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  income_source_id uuid NOT NULL,
  allocated_amount numeric DEFAULT 0 NOT NULL,
  percentage numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_funding
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS income_source_id uuid,
  ADD COLUMN IF NOT EXISTS allocated_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentage numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  invited_by uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  used_at timestamp with time zone,
  invited_user_id uuid,
  suggested_context text DEFAULT 'personal'::text NOT NULL,
  default_permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
  worker_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_invitations
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'::text,
  ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invited_by uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS used_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS invited_user_id uuid,
  ADD COLUMN IF NOT EXISTS suggested_context text DEFAULT 'personal'::text,
  ADD COLUMN IF NOT EXISTS default_permissions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS worker_id uuid;
CREATE TABLE IF NOT EXISTS public.project_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  invoice_number text NOT NULL,
  project_id uuid,
  estimate_id uuid,
  client_name text NOT NULL,
  client_oib text,
  client_address text,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  subtotal numeric DEFAULT 0 NOT NULL,
  vat_amount numeric DEFAULT 0 NOT NULL,
  total_amount numeric DEFAULT 0 NOT NULL,
  currency text DEFAULT 'EUR'::text NOT NULL,
  status text DEFAULT 'issued'::text NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  client_email text,
  auto_reminders_enabled boolean DEFAULT false NOT NULL,
  pdf_path text,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_invoices
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS estimate_id uuid,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_oib text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'issued'::text,
  ADD COLUMN IF NOT EXISTS issue_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS auto_reminders_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE TABLE IF NOT EXISTS public.project_member_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tab_key text NOT NULL,
  visible boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_member_permissions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS tab_key text,
  ADD COLUMN IF NOT EXISTS visible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  display_name text,
  member_context text DEFAULT 'personal'::text NOT NULL,
  member_business_profile_id uuid,
  can_see_investor_price boolean DEFAULT false NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'::text,
  ADD COLUMN IF NOT EXISTS joined_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS member_context text DEFAULT 'personal'::text,
  ADD COLUMN IF NOT EXISTS member_business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS can_see_investor_price boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  budget numeric,
  status text DEFAULT 'pending'::text NOT NULL,
  start_date date,
  due_date date,
  completed_at timestamp with time zone,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  color text DEFAULT '#3b82f6'::text,
  depends_on_milestone_id uuid,
  reminder_days_before integer DEFAULT 3,
  is_contingency boolean DEFAULT false NOT NULL,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  actual_start_date date,
  actual_end_date date,
  is_vtr boolean DEFAULT false NOT NULL,
  source_decision_id uuid,
  investor_price numeric(14,2),
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS budget numeric,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6'::text,
  ADD COLUMN IF NOT EXISTS depends_on_milestone_id uuid,
  ADD COLUMN IF NOT EXISTS reminder_days_before integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS is_contingency boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date,
  ADD COLUMN IF NOT EXISTS is_vtr boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_decision_id uuid,
  ADD COLUMN IF NOT EXISTS investor_price numeric(14,2);
CREATE TABLE IF NOT EXISTS public.project_share_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  created_by uuid NOT NULL,
  show_financials boolean DEFAULT false NOT NULL,
  show_photos boolean DEFAULT true NOT NULL,
  show_milestones boolean DEFAULT true NOT NULL,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  last_viewed_at timestamp with time zone,
  view_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_share_links
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS show_financials boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_photos boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_milestones boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS revoked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '📁'::text NOT NULL,
  color text DEFAULT '#3b82f6'::text NOT NULL,
  category text,
  default_milestones jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '📁'::text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6'::text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS default_milestones jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
CREATE TABLE IF NOT EXISTS public.project_work_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  worker_id uuid NOT NULL,
  project_id uuid,
  work_date date NOT NULL,
  scheduled_hours numeric DEFAULT 8 NOT NULL,
  actual_hours numeric DEFAULT 8 NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  milestone_ids uuid[] DEFAULT '{}'::uuid[],
  business_profile_id uuid,
  payout_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_work_entries
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS work_date date,
  ADD COLUMN IF NOT EXISTS scheduled_hours numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS actual_hours numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS milestone_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS payout_id uuid;
CREATE TABLE IF NOT EXISTS public.project_work_entry_locks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  payout_id uuid NOT NULL,
  project_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  actor_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_work_entry_locks
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS entry_id uuid,
  ADD COLUMN IF NOT EXISTS payout_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_work_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  milestone_id uuid,
  user_id uuid NOT NULL,
  log_date date DEFAULT CURRENT_DATE NOT NULL,
  weather text,
  summary text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  hours numeric,
  day_type text DEFAULT 'work'::text NOT NULL,
  clock_in_time text,
  clock_out_time text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_work_logs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS milestone_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS log_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS weather text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS hours numeric,
  ADD COLUMN IF NOT EXISTS day_type text DEFAULT 'work'::text,
  ADD COLUMN IF NOT EXISTS clock_in_time text,
  ADD COLUMN IF NOT EXISTS clock_out_time text;
CREATE TABLE IF NOT EXISTS public.project_worker_payouts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  expense_id uuid,
  period_start date NOT NULL,
  period_end date NOT NULL,
  hours_covered numeric(10,2) DEFAULT 0 NOT NULL,
  hourly_rate_snapshot numeric(10,2) DEFAULT 0 NOT NULL,
  gross_amount numeric(12,2) DEFAULT 0 NOT NULL,
  paid_amount numeric(12,2) NOT NULL,
  payment_source text,
  paid_at timestamp with time zone NOT NULL,
  note text,
  status text DEFAULT 'paid'::text NOT NULL,
  linked_advance_expense_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  voided_at timestamp with time zone,
  voided_by uuid,
  void_reason text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  batch_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_worker_payouts
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS hours_covered numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_rate_snapshot numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_source text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'paid'::text,
  ADD COLUMN IF NOT EXISTS linked_advance_expense_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS voided_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE TABLE IF NOT EXISTS public.project_worker_rate_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  worker_id uuid NOT NULL,
  rate numeric(10,2) NOT NULL,
  effective_from date NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_worker_rate_history
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.project_workers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  position text NOT NULL,
  work_hours numeric DEFAULT 0 NOT NULL,
  hourly_rate numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  work_start_time time without time zone DEFAULT '08:00:00'::time without time zone,
  work_end_time time without time zone DEFAULT '16:00:00'::time without time zone,
  business_profile_id uuid,
  user_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.project_workers
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS work_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS work_start_time time without time zone DEFAULT '08:00:00'::time without time zone,
  ADD COLUMN IF NOT EXISTS work_end_time time without time zone DEFAULT '16:00:00'::time without time zone,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '📁'::text,
  color text DEFAULT '#3b82f6'::text,
  status text DEFAULT 'draft'::text NOT NULL,
  total_budget numeric DEFAULT 0 NOT NULL,
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  business_profile_id uuid,
  archived_at timestamp with time zone,
  project_type text DEFAULT 'general'::text NOT NULL,
  label_overrides jsonb,
  contract_value numeric,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '📁'::text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6'::text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text,
  ADD COLUMN IF NOT EXISTS total_budget numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS project_type text DEFAULT 'general'::text,
  ADD COLUMN IF NOT EXISTS label_overrides jsonb,
  ADD COLUMN IF NOT EXISTS contract_value numeric,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  source_function text,
  title text,
  body text,
  token_count integer DEFAULT 0 NOT NULL,
  success_count integer DEFAULT 0 NOT NULL,
  failure_count integer DEFAULT 0 NOT NULL,
  fcm_error_codes jsonb,
  request_payload jsonb,
  response_summary jsonb,
  duration_ms integer,
  request_id uuid,
  dispatch_status text,
  dispatch_error text,
  send_push_http_status integer,
  lifecycle_stage text,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.push_delivery_logs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS source_function text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS token_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcm_error_codes jsonb,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS response_summary jsonb,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_status text,
  ADD COLUMN IF NOT EXISTS dispatch_error text,
  ADD COLUMN IF NOT EXISTS send_push_http_status integer,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text;
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text DEFAULT 'android'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'android'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone;
CREATE TABLE IF NOT EXISTS public.receipt_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  expense_id uuid NOT NULL,
  name text NOT NULL,
  quantity numeric DEFAULT 1,
  unit_price numeric,
  total_price numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.receipt_items
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  type text DEFAULT 'expense'::text NOT NULL,
  category text DEFAULT 'other'::text NOT NULL,
  payment_source text,
  payment_source_card_id uuid,
  income_source_id uuid,
  merchant_name text,
  note text,
  transfer_to_source text,
  frequency text DEFAULT 'monthly'::text NOT NULL,
  day_of_month integer,
  day_of_week integer,
  next_due_date date NOT NULL,
  last_generated_date date,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  business_profile_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.recurring_transactions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'expense'::text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'other'::text,
  ADD COLUMN IF NOT EXISTS payment_source text,
  ADD COLUMN IF NOT EXISTS payment_source_card_id uuid,
  ADD COLUMN IF NOT EXISTS income_source_id uuid,
  ADD COLUMN IF NOT EXISTS merchant_name text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS transfer_to_source text,
  ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'monthly'::text,
  ADD COLUMN IF NOT EXISTS day_of_month integer,
  ADD COLUMN IF NOT EXISTS day_of_week integer,
  ADD COLUMN IF NOT EXISTS next_due_date date,
  ADD COLUMN IF NOT EXISTS last_generated_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid;
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  referrer_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS referrer_id uuid,
  ADD COLUMN IF NOT EXISTS referred_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  business_profile_id uuid,
  title text NOT NULL,
  description text,
  remind_at timestamp with time zone NOT NULL,
  type text DEFAULT 'custom'::text,
  is_completed boolean DEFAULT false,
  notified boolean DEFAULT false,
  related_entity_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS remind_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'custom'::text,
  ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS related_entity_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  budget_id uuid,
  name text NOT NULL,
  description text,
  icon text DEFAULT '🎯'::text,
  color text DEFAULT '#22c55e'::text,
  target_amount numeric DEFAULT 0 NOT NULL,
  current_amount numeric DEFAULT 0 NOT NULL,
  target_date date,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS budget_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '🎯'::text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#22c55e'::text,
  ADD COLUMN IF NOT EXISTS target_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email text NOT NULL,
  name text,
  subject text NOT NULL,
  message text NOT NULL,
  category text,
  language text DEFAULT 'hr'::text,
  app_version text,
  user_agent text,
  status text DEFAULT 'open'::text NOT NULL,
  auto_responder_sent boolean DEFAULT false NOT NULL,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  internal_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'hr'::text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'::text,
  ADD COLUMN IF NOT EXISTS auto_responder_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  reason text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.suppressed_emails
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.transaction_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  expense_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.transaction_notes
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.travel_order_expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  travel_order_id uuid NOT NULL,
  expense_type text NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.travel_order_expenses
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS travel_order_id uuid,
  ADD COLUMN IF NOT EXISTS expense_type text,
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.travel_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  destination text NOT NULL,
  purpose text,
  vehicle text DEFAULT 'personal_car'::text,
  km_start numeric DEFAULT 0,
  km_end numeric DEFAULT 0,
  km_rate numeric DEFAULT 0.40,
  daily_allowance_type text DEFAULT 'none'::text,
  status text DEFAULT 'draft'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.travel_orders
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS date_from date,
  ADD COLUMN IF NOT EXISTS date_to date,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS vehicle text DEFAULT 'personal_car'::text,
  ADD COLUMN IF NOT EXISTS km_start numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_end numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_rate numeric DEFAULT 0.40,
  ADD COLUMN IF NOT EXISTS daily_allowance_type text DEFAULT 'none'::text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'::text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  module text NOT NULL,
  source text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  period_start timestamp with time zone DEFAULT now() NOT NULL,
  period_end timestamp with time zone,
  billing_cycle text,
  provider text,
  provider_sub_id text,
  provider_price_id text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.user_entitlements
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text,
  ADD COLUMN IF NOT EXISTS period_start timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS period_end timestamp with time zone,
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_sub_id text,
  ADD COLUMN IF NOT EXISTS provider_price_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.user_login_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  device_info jsonb DEFAULT '{}'::jsonb,
  logged_in_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.user_login_logs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS device_info jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS logged_in_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.user_memories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'fact'::text NOT NULL,
  business_profile_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'fact'::text,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role app_role;
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  tier subscription_tier DEFAULT 'free'::subscription_tier NOT NULL,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS tier subscription_tier DEFAULT 'free'::subscription_tier,
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone,
  processing_error text,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
-- CI: ako je tablica već stvorena užom definicijom (balance baseline),
-- CREATE IF NOT EXISTS se preskoči — pa stupce poravnaj idempotentno.
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS received_at timestamp with time zone DEFAULT now();
-- functions (closure of policy/trigger/default dependencies, topologically sorted)
CREATE OR REPLACE FUNCTION public.rate_at(_worker_id uuid, _d date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT rate
  FROM public.project_worker_rate_history
  WHERE worker_id = _worker_id AND effective_from <= _d
  ORDER BY effective_from DESC
  LIMIT 1
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public._guard_contract_value_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allow text := current_setting('app.allow_contract_baseline_write', true);
  v_has   boolean;
BEGIN
  -- Insert / delete: nema što štititi.
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Bypass za service_role / admin RPC (postavlja set_config prije UPDATE).
  IF v_allow = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_value IS DISTINCT FROM OLD.contract_value THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_contract_amendments
       WHERE project_id = OLD.id
    ) INTO v_has;

    IF v_has THEN
      RAISE EXCEPTION
        'projects.contract_value: baseline zaključan — postoje aneksi ugovora. Ukloni aneksе ili dodaj novi umjesto izmjene baseline vrijednosti.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.cascade_project_soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.expenses           SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by WHERE project_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.project_invoices   SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by WHERE project_id = NEW.id AND deleted_at IS NULL;
    UPDATE public.project_milestones SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by WHERE project_id = NEW.id AND deleted_at IS NULL;
  END IF;

  IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    UPDATE public.expenses           SET deleted_at = NULL, deleted_by = NULL WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
    UPDATE public.project_invoices   SET deleted_at = NULL, deleted_by = NULL WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
    UPDATE public.project_milestones SET deleted_at = NULL, deleted_by = NULL WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public._guard_worker_rate_direct_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_allow text := current_setting('app.allow_rate_write', true);
BEGIN
  IF v_allow = 'on' THEN RETURN NEW; END IF;
  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate THEN
    RAISE EXCEPTION 'project_workers.hourly_rate: direct UPDATE forbidden. Use set_worker_hourly_rate RPC.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.log_project_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_user_id uuid;
  v_action text;
  v_description text;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
    IF v_project_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
    IF TG_OP = 'INSERT' THEN
      v_action := CASE WHEN NEW.type = 'income' THEN 'income_added' ELSE 'expense_added' END;
      v_description := COALESCE(NEW.description, '') || ' (' || NEW.amount::text || ')';
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'expense_deleted';
      v_description := COALESCE(OLD.description, '');
    ELSE RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'project_milestones' THEN
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
    SELECT user_id INTO v_user_id FROM public.projects WHERE id = v_project_id;
    IF TG_OP = 'INSERT' THEN
      v_action := 'milestone_added';
      v_description := NEW.name;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'milestone_status_changed';
      v_description := NEW.name || ' → ' || NEW.status;
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'milestone_deleted';
      v_description := OLD.name;
    ELSE RETURN COALESCE(NEW, OLD);
    END IF;
  ELSIF TG_TABLE_NAME = 'project_work_logs' THEN
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
    IF TG_OP = 'INSERT' THEN
      v_action := 'work_log_added';
      v_description := to_char(NEW.log_date, 'DD.MM.YYYY');
    ELSIF TG_OP = 'UPDATE' THEN
      v_action := 'work_log_updated';
      v_description := to_char(NEW.log_date, 'DD.MM.YYYY');
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'work_log_deleted';
      v_description := to_char(OLD.log_date, 'DD.MM.YYYY');
    END IF;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_user_id IS NOT NULL AND v_project_id IS NOT NULL THEN
    INSERT INTO public.project_activity_log (project_id, user_id, action_type, action_description)
    VALUES (v_project_id, v_user_id, v_action, v_description);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_project_role(_project_id uuid, _user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF _project_id IS NULL OR _user_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id) THEN
    RETURN 'owner';
  END IF;
  SELECT role INTO v_role FROM public.project_members
   WHERE project_id = _project_id AND user_id = _user_id LIMIT 1;
  RETURN v_role;
END;
$function$;
CREATE OR REPLACE FUNCTION public.has_entitlement(_user_id uuid, _module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Direktan entitlement
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND module = _module
      AND status = 'active'
      AND (period_end IS NULL OR period_end > now())
  ) OR EXISTS (
    -- Legacy mapping preko pro_legacy / business_legacy
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND status = 'active'
      AND (period_end IS NULL OR period_end > now())
      AND (
        (module = 'pro_legacy' AND _module IN ('smjer','krug','projekti'))
        OR (module = 'business_legacy' AND _module IN ('smjer','krug','projekti','biznis'))
      )
  ) OR EXISTS (
    -- Admin module grants (legacy sustav)
    SELECT 1 FROM public.admin_module_grants
    WHERE user_id = _user_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (module = 'projects' AND _module = 'projekti')
        OR (module = 'business' AND _module = 'biznis')
      )
  );
$function$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = _project_id AND user_id = _user_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_project_participant_active(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND role <> 'investor'
  );
$function$;
CREATE OR REPLACE FUNCTION public.set_worker_hourly_rate(p_worker_id uuid, p_rate numeric, p_effective_from date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_project_id uuid;
  v_owner_id uuid;
  v_conflict_payout uuid;
  v_conflict_end date;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_rate < 0 THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: rate negative' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: effective_from required' USING ERRCODE = '22023';
  END IF;

  SELECT project_id INTO v_project_id
    FROM public.project_workers WHERE id = p_worker_id FOR UPDATE;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: worker not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT user_id INTO v_owner_id FROM public.projects WHERE id = v_project_id;
  IF v_owner_id <> v_caller THEN
    RAISE EXCEPTION 'set_worker_hourly_rate: not project owner' USING ERRCODE = '42501';
  END IF;

  -- Collision: latest non-voided payout for this worker whose period_end >= effective_from
  SELECT id, period_end INTO v_conflict_payout, v_conflict_end
  FROM public.project_worker_payouts
  WHERE worker_id = p_worker_id
    AND status <> 'voided'
    AND period_end >= p_effective_from
  ORDER BY period_end DESC
  LIMIT 1;

  IF v_conflict_payout IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format(
        'rate_change_collides_with_payout|%s|%s',
        v_conflict_payout::text,
        (v_conflict_end + 1)::text
      );
  END IF;

  PERFORM set_config('app.allow_rate_write', 'on', true);

  INSERT INTO public.project_worker_rate_history (worker_id, rate, effective_from, created_by)
  VALUES (p_worker_id, p_rate, p_effective_from, v_caller)
  ON CONFLICT (worker_id, effective_from) DO UPDATE
    SET rate = EXCLUDED.rate, created_by = EXCLUDED.created_by, created_at = now();

  UPDATE public.project_workers
     SET hourly_rate = public.rate_at(p_worker_id, CURRENT_DATE)
   WHERE id = p_worker_id;

  RETURN jsonb_build_object(
    'worker_id',      p_worker_id,
    'rate',           p_rate,
    'effective_from', p_effective_from,
    'current_rate',   public.rate_at(p_worker_id, CURRENT_DATE)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_milestone_column_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.get_project_role(COALESCE(NEW.project_id, OLD.project_id), auth.uid());

  -- NULL = nema app korisnika (service_role / cron / definer put) → bez provjere.
  IF v_role IS NULL OR v_role = 'owner' THEN
    RETURN NEW;
  END IF;

  IF NEW.budget             IS DISTINCT FROM OLD.budget
     OR NEW.investor_price  IS DISTINCT FROM OLD.investor_price
     OR NEW.is_vtr          IS DISTINCT FROM OLD.is_vtr
     OR NEW.is_contingency  IS DISTINCT FROM OLD.is_contingency
     OR NEW.source_decision_id IS DISTINCT FROM OLD.source_decision_id
     OR NEW.project_id      IS DISTINCT FROM OLD.project_id
  THEN
    RAISE EXCEPTION 'milestone_amount_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_projects_subscriber(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_entitlement(_user_id, 'projekti')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$function$;
CREATE OR REPLACE FUNCTION public.can_write_module(_user uuid, _module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _user IS NOT NULL
    AND (
      public.has_entitlement(_user, _module)
      OR public.has_role(_user, 'admin'::app_role)
    )
$function$;
CREATE OR REPLACE FUNCTION public.projects_downgrade_ok(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.user_id = _user_id
  ) OR public.is_projects_subscriber(_user_id);
$function$;
CREATE OR REPLACE FUNCTION public.can_write_project_progress(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.get_project_role(_project_id, _user_id) IN ('owner','member')
     AND public.projects_downgrade_ok(_project_id, _user_id);
$function$;
-- grants
GRANT EXECUTE ON FUNCTION public.set_worker_hourly_rate(p_worker_id uuid, p_rate numeric, p_effective_from date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_at(_worker_id uuid, _d date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_role(_project_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_projects_subscriber(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_entitlement(_user_id uuid, _module text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_module(_user uuid, _module text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(_project_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.projects_downgrade_ok(_project_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_project_progress(_project_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_participant_active(_project_id uuid, _user_id uuid) TO authenticated;
-- unique indexes (ON CONFLICT targets depend on them)
CREATE UNIQUE INDEX IF NOT EXISTS project_workers_project_user_uniq ON public.project_workers USING btree (project_id, user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_id_key ON public.notification_preferences USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_id_key ON public.user_subscriptions USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS activation_nudge_log_user_id_day_number_key ON public.activation_nudge_log USING btree (user_id, day_number);
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_unique ON public.push_tokens USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS milestone_budget_alerts_milestone_id_threshold_user_id_key ON public.milestone_budget_alerts USING btree (milestone_id, threshold, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_worker_payout ON public.expenses USING btree (user_id, worker_payout_id) WHERE (worker_payout_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_worker_payout_batch ON public.expenses USING btree (user_id, worker_payout_batch_id) WHERE (worker_payout_batch_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_user_id_token_key ON public.push_tokens USING btree (user_id, token);
CREATE UNIQUE INDEX IF NOT EXISTS project_worker_rate_history_worker_id_effective_from_key ON public.project_worker_rate_history USING btree (worker_id, effective_from);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_investor_singleton ON public.project_members USING btree (project_id) WHERE (role = 'investor'::text);
CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_id_user_id_key ON public.project_members USING btree (project_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_funding_project_id_income_source_id_key ON public.project_funding USING btree (project_id, income_source_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_milestone_source_decision ON public.project_milestones USING btree (source_decision_id) WHERE ((source_decision_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON public.profiles USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS income_source_members_income_source_id_user_id_key ON public.income_source_members USING btree (income_source_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS income_source_invitations_income_source_id_email_key ON public.income_source_invitations USING btree (income_source_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdar_pending_per_decision ON public.project_decision_admin_requests USING btree (decision_id) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX IF NOT EXISTS project_decision_steps_decision_id_step_no_key ON public.project_decision_steps USING btree (decision_id, step_no);
CREATE UNIQUE INDEX IF NOT EXISTS project_member_permissions_project_id_user_id_tab_key_key ON public.project_member_permissions USING btree (project_id, user_id, tab_key);
-- U CI-ju se ovaj baseline primjenjuje NAKON balance baselinea, koji ima stariju,
-- užu verziju `notifications`. Zbog `CREATE TABLE IF NOT EXISTS` gornja definicija
-- se tada preskoči, pa parcijalni indeks ispod nema stupce. Idempotentno ih dodaj.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text NOT NULL,
  ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_active_dedup ON public.notifications USING btree (user_id, dedup_key) WHERE ((status = 'active'::text) AND (dedup_key IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role);
CREATE UNIQUE INDEX IF NOT EXISTS import_transfer_rules_unique_key ON public.import_transfer_rules USING btree (user_id, merchant_key, source_wallet_key);
CREATE UNIQUE INDEX IF NOT EXISTS admin_module_grants_one_live_per_module ON public.admin_module_grants USING btree (user_id, module) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_connections_state_token ON public.bank_connections USING btree (state_token) WHERE (state_token IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_connection_id_account_uid_key ON public.bank_accounts USING btree (connection_id, account_uid);
CREATE UNIQUE INDEX IF NOT EXISTS krug_ownership_unique_per_krug ON public.krug_ownership USING btree (krug_id);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_id_key ON public.referrals USING btree (referred_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS krug_income_ratio_krug_id_user_id_effective_from_key ON public.krug_income_ratio USING btree (krug_id, user_id, effective_from);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_bank_tx ON public.expenses USING btree (user_id, bank_transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_budget_id_category_key ON public.budget_categories USING btree (budget_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_reminders_invoice_id_stage_trigger_key ON public.invoice_reminders USING btree (invoice_id, stage, trigger);
CREATE UNIQUE INDEX IF NOT EXISTS project_work_entries_worker_id_work_date_key ON public.project_work_entries USING btree (worker_id, work_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recurring_per_day ON public.expenses USING btree (user_id, recurring_transaction_id, date) WHERE ((recurring_transaction_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS budget_members_budget_id_user_id_key ON public.budget_members USING btree (budget_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_share_links_token_key ON public.project_share_links USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_user_active_unique ON public.business_profiles USING btree (user_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_imported_statements_user_filehash ON public.imported_statements USING btree (user_id, file_hash) WHERE (file_hash IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_imported_statements_user_contenthash ON public.imported_statements USING btree (user_id, content_hash) WHERE (content_hash IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_decision_amendment ON public.project_decisions USING btree (contract_amendment_id) WHERE (contract_amendment_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS project_work_logs_unique_per_author ON public.project_work_logs USING btree (project_id, log_date, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_override_one_pending ON public.krug_expense_split_override USING btree (expense_id) WHERE (status = 'pending'::krug_override_status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_override_one_active ON public.krug_expense_split_override USING btree (expense_id) WHERE (status = 'potvrdjena'::krug_override_status);
CREATE UNIQUE INDEX IF NOT EXISTS krug_membership_unique_user_per_krug ON public.krug_membership USING btree (krug_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_entitlements_user_id_module_provider_sub_id_key ON public.user_entitlements USING btree (user_id, module, provider_sub_id);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_key ON public.webhook_events USING btree (provider, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS krug_expense_split_share_override_id_user_id_key ON public.krug_expense_split_share USING btree (override_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);
CREATE UNIQUE INDEX IF NOT EXISTS suppressed_emails_email_key ON public.suppressed_emails USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribe_tokens_token_key ON public.email_unsubscribe_tokens USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribe_tokens_email_key ON public.email_unsubscribe_tokens USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS krug_shared_payment_source_krug_id_payment_source_id_key ON public.krug_shared_payment_source USING btree (krug_id, payment_source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_events_unique_user_event ON public.funnel_events USING btree (user_id, event_name) WHERE ((user_id IS NOT NULL) AND (event_name = ANY (ARRAY['signup'::text, 'onboarding_complete'::text, 'first_transaction'::text, 'paid_conversion'::text])));
CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_events_unique_install_session ON public.funnel_events USING btree (session_id, event_name) WHERE ((session_id IS NOT NULL) AND (event_name = 'install'::text));
CREATE UNIQUE INDEX IF NOT EXISTS krug_act_dedup_user_id_expense_id_act_client_request_id_key ON public.krug_act_dedup USING btree (user_id, expense_id, act, client_request_id);
-- grants: prod ima ALL za anon+authenticated na svim public tablicama
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
-- ---- Korak D popravak: pogled + pomoćnici + RPC za napredak ----
CREATE OR REPLACE FUNCTION public.can_read_project_phases(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_project_participant_active(_project_id, _user_id)
     AND public.projects_downgrade_ok(_project_id, _user_id);
$function$;
CREATE OR REPLACE FUNCTION public.member_sees_investor_price(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = _project_id
      AND pm.user_id = _user_id
      AND pm.role = 'member'
      AND pm.can_see_investor_price
  );
$function$;
CREATE OR REPLACE FUNCTION public.guard_member_investor_price_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.can_see_investor_price IS DISTINCT FROM OLD.can_see_investor_price
     AND NOT public.is_project_owner(NEW.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'only_project_owner_can_set_investor_price_flag'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT'
     AND NEW.can_see_investor_price
     AND NOT public.is_project_owner(NEW.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'only_project_owner_can_set_investor_price_flag'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_guard_member_investor_price_flag ON public.project_members;
CREATE TRIGGER trg_guard_member_investor_price_flag
  BEFORE INSERT OR UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_investor_price_flag();
CREATE OR REPLACE VIEW public.project_milestones_scoped AS
 SELECT id,
    project_id,
    name,
    description,
    status,
    start_date,
    due_date,
    completed_at,
    actual_start_date,
    actual_end_date,
    sort_order,
    color,
    depends_on_milestone_id,
    reminder_days_before,
    is_contingency,
    is_vtr,
    source_decision_id,
    deleted_at,
    created_at,
    updated_at,
        CASE
            WHEN get_project_role(project_id, auth.uid()) = ANY (ARRAY['owner'::text, 'viewer'::text, 'member'::text]) THEN budget
            ELSE NULL::numeric
        END AS budget,
        CASE
            WHEN get_project_role(project_id, auth.uid()) = ANY (ARRAY['owner'::text, 'viewer'::text, 'investor'::text]) THEN investor_price
            WHEN member_sees_investor_price(project_id, auth.uid()) THEN investor_price
            ELSE NULL::numeric
        END AS investor_price
   FROM project_milestones m
  WHERE deleted_at IS NULL AND can_read_project_phases(project_id, auth.uid());
GRANT SELECT ON public.project_milestones_scoped TO authenticated;
CREATE OR REPLACE FUNCTION public.can_write_milestone_children(_milestone_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = _milestone_id
      AND public.can_write_project_progress(m.project_id, _user_id)
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_milestone_project_member(_milestone_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = _milestone_id
      AND public.is_project_member(m.project_id, _user_id)
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_milestone_project_owner(_milestone_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = _milestone_id
      AND public.is_project_owner(m.project_id, _user_id)
  );
$function$;
CREATE OR REPLACE FUNCTION public.update_milestone_progress(p_milestone_id uuid, p_patch jsonb)
 RETURNS project_milestones_scoped
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
  v_row public.project_milestones_scoped%ROWTYPE;
  k text;
  c_allowed CONSTANT text[] := ARRAY[
    'name','description','status','start_date','due_date',
    'actual_start_date','actual_end_date','completed_at',
    'sort_order','color','depends_on_milestone_id','reminder_days_before'
  ];
  c_forbidden CONSTANT text[] := ARRAY[
    'budget','investor_price','is_vtr','is_contingency','source_decision_id',
    'project_id','id','deleted_at','deleted_by'
  ];
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'milestone_patch_empty' USING ERRCODE = '22023';
  END IF;

  SELECT m.project_id INTO v_project
  FROM public.project_milestones m
  WHERE m.id = p_milestone_id AND m.deleted_at IS NULL;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'milestone_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Uloga + stanje pretplate vlasnika u jednom predikatu (owner|member).
  IF NOT public.can_write_project_progress(v_project, auth.uid()) THEN
    RAISE EXCEPTION 'milestone_progress_forbidden' USING ERRCODE = '42501';
  END IF;

  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF k = ANY (c_forbidden) THEN
      RAISE EXCEPTION 'milestone_amount_forbidden' USING ERRCODE = '42501';
    ELSIF NOT (k = ANY (c_allowed)) THEN
      RAISE EXCEPTION 'milestone_field_not_allowed: %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.project_milestones m SET
    name        = CASE WHEN p_patch ? 'name'        THEN p_patch->>'name'        ELSE m.name END,
    description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE m.description END,
    status      = CASE WHEN p_patch ? 'status'      THEN p_patch->>'status'      ELSE m.status END,
    start_date        = CASE WHEN p_patch ? 'start_date'        THEN (p_patch->>'start_date')::date        ELSE m.start_date END,
    due_date          = CASE WHEN p_patch ? 'due_date'          THEN (p_patch->>'due_date')::date          ELSE m.due_date END,
    actual_start_date = CASE WHEN p_patch ? 'actual_start_date' THEN (p_patch->>'actual_start_date')::date ELSE m.actual_start_date END,
    actual_end_date   = CASE WHEN p_patch ? 'actual_end_date'   THEN (p_patch->>'actual_end_date')::date   ELSE m.actual_end_date END,
    completed_at      = CASE WHEN p_patch ? 'completed_at'      THEN (p_patch->>'completed_at')::timestamptz ELSE m.completed_at END,
    sort_order        = CASE WHEN p_patch ? 'sort_order'        THEN (p_patch->>'sort_order')::int         ELSE m.sort_order END,
    color             = CASE WHEN p_patch ? 'color'             THEN p_patch->>'color'                     ELSE m.color END,
    depends_on_milestone_id = CASE WHEN p_patch ? 'depends_on_milestone_id' THEN (p_patch->>'depends_on_milestone_id')::uuid ELSE m.depends_on_milestone_id END,
    reminder_days_before    = CASE WHEN p_patch ? 'reminder_days_before'    THEN (p_patch->>'reminder_days_before')::int    ELSE m.reminder_days_before END,
    updated_at = now()
  WHERE m.id = p_milestone_id;

  -- Povrat kroz role-scoped pogled: pozivatelj dobiva samo ono što smije vidjeti.
  SELECT * INTO v_row FROM public.project_milestones_scoped v WHERE v.id = p_milestone_id;
  RETURN v_row;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.can_read_project_phases(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_milestone_children(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_milestone_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_milestone_project_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_milestone_progress(uuid, jsonb) TO authenticated;
-- RLS + policies for matrix tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated, anon;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated, anon;
ALTER TABLE public.milestone_budget_revisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestone_budget_revisions TO authenticated, anon;
ALTER TABLE public.project_budget_revisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_budget_revisions TO authenticated, anon;
ALTER TABLE public.project_contract_amendments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_contract_amendments TO authenticated, anon;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated, anon;
ALTER TABLE public.milestone_checklist_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestone_checklist_items TO authenticated, anon;
ALTER TABLE public.project_workers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_workers TO authenticated, anon;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated, anon;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invitations TO authenticated, anon;
CREATE POLICY "Project members can view milestone revisions" ON public.milestone_budget_revisions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_project_member(project_id, auth.uid()));
CREATE POLICY "Project owner can delete milestone revisions" ON public.milestone_budget_revisions AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can insert milestone revisions" ON public.milestone_budget_revisions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_project_owner(project_id, auth.uid()) AND (user_id = auth.uid())));
CREATE POLICY "members can view checklist" ON public.milestone_checklist_items AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_milestone_project_member(milestone_id, auth.uid()));
CREATE POLICY "owner or manager can insert checklist" ON public.milestone_checklist_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND can_write_milestone_children(milestone_id, auth.uid())));
CREATE POLICY "owner or manager can update checklist" ON public.milestone_checklist_items AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_write_milestone_children(milestone_id, auth.uid()))
  WITH CHECK (can_write_milestone_children(milestone_id, auth.uid()));
CREATE POLICY "owner or project owner can delete checklist" ON public.milestone_checklist_items AS PERMISSIVE FOR DELETE TO authenticated
  USING (((auth.uid() = user_id) OR is_milestone_project_owner(milestone_id, auth.uid())));
CREATE POLICY "Project members can view revisions" ON public.project_budget_revisions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_project_member(project_id, auth.uid()));
CREATE POLICY "Project owners can create revisions" ON public.project_budget_revisions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project members can view contract amendments" ON public.project_contract_amendments AS PERMISSIVE FOR SELECT TO public
  USING (is_project_member(project_id, auth.uid()));
CREATE POLICY "Project owners can delete contract amendments" ON public.project_contract_amendments AS PERMISSIVE FOR DELETE TO public
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can insert contract amendments" ON public.project_contract_amendments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND is_project_owner(project_id, auth.uid())));
CREATE POLICY "Owner or manager can insert project documents" ON public.project_documents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((can_write_project_progress(project_id, auth.uid()) AND (uploaded_by = auth.uid())));
CREATE POLICY "Owner or manager can update project documents" ON public.project_documents AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_write_project_progress(project_id, auth.uid()))
  WITH CHECK (can_write_project_progress(project_id, auth.uid()));
CREATE POLICY "Project participants can view documents" ON public.project_documents AS PERMISSIVE FOR SELECT TO public
  USING (is_project_participant_active(project_id, auth.uid()));
CREATE POLICY "Uploader or owner can delete documents" ON public.project_documents AS PERMISSIVE FOR DELETE TO authenticated
  USING (((uploaded_by = auth.uid()) OR is_project_owner(project_id, auth.uid())));
CREATE POLICY "project_documents_readonly_when_downgraded" ON public.project_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_documents.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid())))
  WITH CHECK (((NOT (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_documents.project_id) AND (p.user_id = auth.uid()))))) OR is_projects_subscriber(auth.uid())));
CREATE POLICY "Invited users can view their project invitations" ON public.project_invitations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((invited_user_id = auth.uid()));
CREATE POLICY "Project owners can create invitations" ON public.project_invitations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can delete invitations" ON public.project_invitations AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update invitations" ON public.project_invitations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can view invitations" ON public.project_invitations AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Members can update own context" ON public.project_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Project members can view memberships" ON public.project_members AS PERMISSIVE FOR SELECT TO public
  USING (is_project_member(project_id, auth.uid()));
CREATE POLICY "Project owners can delete members" ON public.project_members AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can insert members" ON public.project_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_project_owner(project_id, auth.uid()) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Project owners can update members" ON public.project_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK ((is_project_owner(project_id, auth.uid()) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Managers can update milestone progress" ON public.project_milestones AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_write_project_progress(project_id, auth.uid()))
  WITH CHECK (can_write_project_progress(project_id, auth.uid()));
CREATE POLICY "Project owners can create milestones" ON public.project_milestones AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_project_owner(project_id, auth.uid()) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Project owners can delete milestones" ON public.project_milestones AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update milestones" ON public.project_milestones AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK ((is_project_owner(project_id, auth.uid()) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Project owners can view milestones" ON public.project_milestones AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "hide_soft_deleted" ON public.project_milestones AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((deleted_at IS NULL));
CREATE POLICY "project_milestones_readonly_when_downgraded" ON public.project_milestones AS RESTRICTIVE FOR ALL TO authenticated
  USING (projects_downgrade_ok(project_id, auth.uid()))
  WITH CHECK (projects_downgrade_ok(project_id, auth.uid()));
CREATE POLICY "Owners see all workers, members see only own row" ON public.project_workers AS PERMISSIVE FOR SELECT TO public
  USING ((is_project_owner(project_id, auth.uid()) OR (user_id = auth.uid())));
CREATE POLICY "Project owners can add workers" ON public.project_workers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_project_owner(project_id, auth.uid()) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Project owners can manage workers" ON public.project_workers AS PERMISSIVE FOR ALL TO public
  USING (is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update workers" ON public.project_workers AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK ((is_project_owner(project_id, auth.uid()) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Users can manage business workers" ON public.project_workers AS PERMISSIVE FOR ALL TO authenticated
  USING (((business_profile_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM business_profiles bp
  WHERE ((bp.id = project_workers.business_profile_id) AND (bp.user_id = auth.uid()))))))
  WITH CHECK (((business_profile_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM business_profiles bp
  WHERE ((bp.id = project_workers.business_profile_id) AND (bp.user_id = auth.uid()))))));
CREATE POLICY "Members can view shared projects" ON public.projects AS PERMISSIVE FOR SELECT TO public
  USING (is_project_member(id, auth.uid()));
CREATE POLICY "Users can create their own projects" ON public.projects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Users can delete their own projects" ON public.projects AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own projects" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK (((auth.uid() = user_id) AND can_write_module(auth.uid(), 'projekti'::text)));
CREATE POLICY "Users can view their own projects" ON public.projects AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "hide_soft_deleted" ON public.projects AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((deleted_at IS NULL));
CREATE POLICY "projects_readonly_when_downgraded" ON public.projects AS RESTRICTIVE FOR ALL TO authenticated
  USING (((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid())))
  WITH CHECK (((user_id <> auth.uid()) OR is_projects_subscriber(auth.uid())));
-- triggers
CREATE TRIGGER trg_checklist_updated BEFORE UPDATE ON public.milestone_checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_documents_updated_at BEFORE UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_guard_milestone_column_writes BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION guard_milestone_column_writes();
CREATE TRIGGER trg_log_milestone_activity AFTER INSERT OR DELETE OR UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION log_project_activity();
CREATE TRIGGER update_project_milestones_updated_at BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_guard_worker_rate_direct_update BEFORE UPDATE ON public.project_workers FOR EACH ROW EXECUTE FUNCTION _guard_worker_rate_direct_update();
CREATE TRIGGER update_project_workers_updated_at BEFORE UPDATE ON public.project_workers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_cascade_project_soft_delete AFTER UPDATE OF deleted_at ON public.projects FOR EACH ROW EXECUTE FUNCTION cascade_project_soft_delete();
CREATE TRIGGER trg_guard_contract_value_update BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION _guard_contract_value_update();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================================================
-- Korak E — troškovi na potvrdu (snimka žive sheme, 2026-08-02)
-- ---------------------------------------------------------------------------
-- Namjerno se preuzima SAMO ono što matrica dotiče: stupci pregleda, INSERT/
-- UPDATE/DELETE/SELECT politike za `expenses`, guard trigger i RPC.
-- NIJE preuzeto (i harness o tome ne tvrdi ništa):
--   * politike za krug i dijeljene izvore plaćanja (krug_select_visibility,
--     "Members can ... shared payment sources") — druga domena, druge funkcije,
--   * balance trigeri nad `expenses` — utjecaj pending/rejected na saldo
--     dokazuje balance paket (supabase/tests/balance, scenariji E1–E6).
-- ===========================================================================
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_rejection_reason_requires_rejected;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_rejection_reason_requires_rejected
  CHECK (rejection_reason IS NULL OR status = 'rejected'::transaction_status);

CREATE OR REPLACE FUNCTION public.is_income_source_member(_source_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.income_source_members
    WHERE income_source_id = _source_id AND user_id = _user_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_income_source_owner(_user_id uuid, _source_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.income_source_members
    WHERE user_id = _user_id AND income_source_id = _source_id AND role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.income_sources
    WHERE id = _source_id AND user_id = _user_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.guard_expense_review_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.project_id IS NULL AND OLD.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
  THEN
    IF COALESCE(current_setting('app.expense_reviewer', true), '') <> 'rpc' THEN
      RAISE EXCEPTION 'Review fields can only be changed through review_project_expense()'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_project_expense(p_expense_id uuid, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
  v_status transaction_status;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023';
  END IF;

  SELECT project_id, status INTO v_project, v_status
    FROM public.expenses
   WHERE id = p_expense_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_project IS NULL THEN
    RAISE EXCEPTION 'Project expense not found' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_project_owner(v_project, v_uid) THEN
    RAISE EXCEPTION 'Only the project owner can review expenses' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'pending'::transaction_status THEN
    RAISE EXCEPTION 'Expense is not pending' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.expense_reviewer', 'rpc', true);
  UPDATE public.expenses
     SET status = CASE WHEN p_decision = 'approve'
                       THEN 'approved'::transaction_status
                       ELSE 'rejected'::transaction_status END,
         rejection_reason = CASE WHEN p_decision = 'reject' THEN NULLIF(p_reason, '') ELSE NULL END,
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_expense_id;
  PERFORM set_config('app.expense_reviewer', '', true);

  RETURN jsonb_build_object('id', p_expense_id, 'decision', p_decision);
END;
$function$;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated, anon;

CREATE POLICY "Users can create their own expenses" ON public.expenses AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
CASE
    WHEN (project_id IS NOT NULL) THEN ((auth.uid() = user_id) AND (is_project_owner(project_id, auth.uid()) OR ((get_project_role(project_id, auth.uid()) = 'member'::text) AND (status = 'pending'::transaction_status) AND (submitted_by = auth.uid()))))
    ELSE ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())))
END);
CREATE POLICY "Users can update their own expenses" ON public.expenses AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
CASE
    WHEN (project_id IS NOT NULL) THEN (is_project_participant_active(project_id, auth.uid()) AND ((auth.uid() = user_id) OR is_project_owner(project_id, auth.uid())))
    ELSE ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)))
END)
  WITH CHECK (
CASE
    WHEN (project_id IS NOT NULL) THEN (is_project_participant_active(project_id, auth.uid()) AND ((auth.uid() = user_id) OR is_project_owner(project_id, auth.uid())))
    ELSE ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)))
END);
CREATE POLICY "Users can delete their own expenses" ON public.expenses AS PERMISSIVE FOR DELETE TO authenticated
  USING (
CASE
    WHEN (project_id IS NOT NULL) THEN (is_project_participant_active(project_id, auth.uid()) AND ((auth.uid() = user_id) OR is_project_owner(project_id, auth.uid())))
    ELSE ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)))
END);
CREATE POLICY "Users can view their own expenses" ON public.expenses AS PERMISSIVE FOR SELECT TO authenticated
  USING (
CASE
    WHEN (project_id IS NOT NULL) THEN is_project_participant_active(project_id, auth.uid())
    ELSE ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())))
END);
CREATE POLICY "hide_soft_deleted" ON public.expenses AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((deleted_at IS NULL));

DROP TRIGGER IF EXISTS trg_guard_expense_review_writes ON public.expenses;
CREATE TRIGGER trg_guard_expense_review_writes BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION guard_expense_review_writes();
