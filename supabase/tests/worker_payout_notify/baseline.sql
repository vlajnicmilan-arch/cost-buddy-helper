-- Minimalna podloga za obavijest o isplati radniku (enqueue + okidači + outbox).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS net CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Kao Supabase: zadane privilegije daju anon/authenticated sve na nove objekte.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text NOT NULL);
CREATE TABLE public.project_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, user_id uuid,
  first_name text NOT NULL DEFAULT 'P', last_name text NOT NULL DEFAULT 'R');
CREATE TABLE public.project_worker_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, worker_id uuid NOT NULL,
  period_start date NOT NULL DEFAULT current_date, period_end date NOT NULL DEFAULT current_date,
  paid_amount numeric NOT NULL DEFAULT 10, status text NOT NULL DEFAULT 'paid', batch_id uuid,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, worker_payout_id uuid,
  worker_payout_batch_id uuid, deleted_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL, title text NOT NULL,
  message text NOT NULL, data jsonb DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'active', dedup_key text);
CREATE UNIQUE INDEX uniq_notifications_active_dedup ON public.notifications (user_id, dedup_key)
  WHERE status = 'active' AND dedup_key IS NOT NULL;
CREATE TABLE public.app_diagnostics_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event text NOT NULL, severity text, details jsonb,
  app_version text, created_at timestamptz DEFAULT now());

-- net.http_post zamjena: bilježi pozive; net_fail=1 simulira kvar.
CREATE SCHEMA net;
CREATE TABLE net.calls (url text, body jsonb, at timestamptz DEFAULT now());
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
  headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000) RETURNS bigint
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.net_fail', true) = '1' THEN RAISE EXCEPTION 'net down'; END IF;
  INSERT INTO net.calls (url, body) VALUES (url, body);
  RETURN 1;
END $$;

-- Krug HTTP emit postoji živo (0022); ovdje samo da retry može kompajlirati poziv.
CREATE FUNCTION public._krug_emit_http(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb)
RETURNS void LANGUAGE sql AS $$ SELECT $$;

-- Okidači kao živo (definicije funkcija dolaze iz migracije).
CREATE FUNCTION public.trg_worker_payout_notify_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.trg_worker_payout_notify_void() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_worker_payout_notify_insert AFTER INSERT ON public.project_worker_payouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_worker_payout_notify_insert();
CREATE TRIGGER trg_worker_payout_notify_void AFTER UPDATE OF status ON public.project_worker_payouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_worker_payout_notify_void();
