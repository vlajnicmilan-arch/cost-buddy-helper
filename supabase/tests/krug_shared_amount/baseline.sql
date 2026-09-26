-- Minimalna shema za krug_shared_amount paket (samo stupci koje funkcije koriste).
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TYPE public.krug_membership_role AS ENUM ('punopravni','obicni');
CREATE TYPE public.krug_privacy AS ENUM ('personal','private','shared');
CREATE TYPE public.krug_shared_status AS ENUM ('predlozena','potvrdjena','nepotvrdjena');
CREATE TYPE public.krug_split_mode AS ENUM ('equal','proportional_income','manual');
CREATE TYPE public.krug_override_status AS ENUM ('pending','potvrdjena','povucena','odbijena');

CREATE TABLE public.krug (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text,
  split_mode public.krug_split_mode NOT NULL DEFAULT 'equal', settlement_currency text, deleted_at timestamptz);
CREATE TABLE public.krug_ownership (krug_id uuid, user_id uuid);
CREATE TABLE public.krug_membership (krug_id uuid, user_id uuid, role public.krug_membership_role);
CREATE TABLE public.krug_income_ratio (krug_id uuid, user_id uuid, weight numeric, effective_from date);
CREATE TABLE public.krug_settlement_fx_snapshot (krug_id uuid, period_start date, period_end date,
  display_currency text, rates jsonb, frozen_at timestamptz, source text);
CREATE TABLE public.custom_payment_sources (id uuid PRIMARY KEY, currency text);
CREATE TABLE public.krug_shared_payment_source (krug_id uuid, payment_source_id text, linked_at timestamptz);
CREATE TABLE public.krug_settlement_ledger (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), krug_id uuid,
  from_user uuid, to_user uuid, amount numeric, currency text, marked_at timestamptz, voided_at timestamptz);
CREATE TABLE public.expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, krug_id uuid,
  krug_privacy public.krug_privacy, krug_shared_status public.krug_shared_status, type text DEFAULT 'expense',
  amount numeric, currency text, date date DEFAULT current_date, deleted_at timestamptz,
  krug_reject_reason text, updated_at timestamptz);
CREATE TABLE public.krug_expense_split_override (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL, krug_id uuid NOT NULL, proposed_by uuid NOT NULL,
  status public.krug_override_status NOT NULL DEFAULT 'pending', activated_at timestamptz,
  superseded_by uuid, reject_reason text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.krug_expense_split_share (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid, user_id uuid, share_percent numeric);
CREATE TABLE public.krug_expense_split_confirmation (override_id uuid, user_id uuid,
  confirmed_at timestamptz DEFAULT now(), PRIMARY KEY (override_id, user_id));
CREATE TABLE public.notify_log (event text, recipients uuid[]);

CREATE OR REPLACE FUNCTION public.krug_is_full_member(_krug uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id=_krug AND user_id=_user)
      OR EXISTS (SELECT 1 FROM public.krug_membership WHERE krug_id=_krug AND user_id=_user AND role='punopravni');
$$;
CREATE OR REPLACE FUNCTION public.krug_emit_notification(p_event_type text, p_krug_id uuid, p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL, p_deletion_request_id uuid DEFAULT NULL, p_dedup_ref text DEFAULT NULL,
  p_recipient_override uuid[] DEFAULT NULL, p_vars jsonb DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO public.notify_log VALUES (p_event_type, p_recipient_override) $$;

-- Stanje prava kao na živoj bazi.
DO $$ BEGIN END $$;
