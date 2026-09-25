-- Minimalna podloga za obavijest o upisanim satima i povezivanje radnika.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text NOT NULL);
-- Kao živa tablica: veza po user_id, bez stupca full_name.
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, display_name text);
CREATE TABLE public.project_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, user_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.project_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, user_id uuid,
  business_profile_id uuid, first_name text NOT NULL DEFAULT 'P', last_name text NOT NULL DEFAULT 'R');
CREATE TABLE public.project_work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, user_id uuid NOT NULL,
  log_date date NOT NULL, hours numeric, summary text NOT NULL DEFAULT '', milestone_id uuid);
CREATE TABLE public.project_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, project_id uuid NOT NULL,
  work_date date NOT NULL, scheduled_hours numeric, actual_hours numeric, note text, milestone_ids uuid[],
  business_profile_id uuid, updated_at timestamptz DEFAULT now(), UNIQUE (worker_id, work_date));
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL, title text NOT NULL,
  message text NOT NULL, data jsonb DEFAULT '{}'::jsonb, read boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'active');
