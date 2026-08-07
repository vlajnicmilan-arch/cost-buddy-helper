-- Minimalni baseline za Krug consent harness.
--
-- Zasto curated baseline (isti razlog kao kod balance suite): puna migracijska
-- povijest nije linearno ponovljiva na golom postgres:16 (nedostaju Supabase
-- ekstenzije). Ovaj baseline stvara SAMO ono sto pozivnice diraju, a same
-- pozivnice (tablica, RLS, trigger, RPC-i) dolaze iz PRAVIH migracijskih
-- datoteka koje se primjenjuju na vrh — dakle testira se stvarni SQL.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'krug_membership_role') THEN
    CREATE TYPE public.krug_membership_role AS ENUM ('punopravni', 'obicni');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'krug_preset') THEN
    CREATE TYPE public.krug_preset AS ENUM ('partner','su_roditelj','cimer','putovanje','projekt','klub');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'krug_lifecycle_state') THEN
    CREATE TYPE public.krug_lifecycle_state AS ENUM ('active','early_signal','ugrozen','continuity_window','read_only','deleted');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text
);

CREATE TABLE IF NOT EXISTS public.krug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  preset public.krug_preset NOT NULL,
  lifecycle_state public.krug_lifecycle_state NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.krug_ownership (
  krug_id uuid PRIMARY KEY REFERENCES public.krug(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.krug_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.krug_membership_role NOT NULL DEFAULT 'obicni',
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (krug_id, user_id)
);

ALTER TABLE public.krug_membership ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.krug_is_owner(_krug_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id = _krug_id AND user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.can_write_module(_user_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

-- Preset cap trigger — ista semantika kao u produkciji (partner/su_roditelj 2, cimer 6).
CREATE OR REPLACE FUNCTION public.krug_enforce_punopravni_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_preset text; v_cap int; v_count int;
BEGIN
  IF NEW.role <> 'punopravni'::public.krug_membership_role THEN RETURN NEW; END IF;
  SELECT preset::text INTO v_preset FROM public.krug WHERE id = NEW.krug_id;
  v_cap := CASE v_preset WHEN 'partner' THEN 2 WHEN 'su_roditelj' THEN 2 WHEN 'cimer' THEN 6 ELSE NULL END;
  IF v_cap IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.krug_membership
   WHERE krug_id = NEW.krug_id AND role = 'punopravni'::public.krug_membership_role;
  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'krug_punopravni_cap: cap % reached', v_cap;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS krug_punopravni_cap ON public.krug_membership;
CREATE TRIGGER krug_punopravni_cap BEFORE INSERT OR UPDATE ON public.krug_membership
  FOR EACH ROW EXECUTE FUNCTION public.krug_enforce_punopravni_cap();

-- STARA politika (pre-consent). Migracija je mora ukloniti; dok je tu,
-- consent test 1 pada — to je dokaz da test hvata regresiju.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='krug_membership' AND policyname='krug_membership_insert_owner'
  ) THEN
    EXECUTE $p$CREATE POLICY "krug_membership_insert_owner" ON public.krug_membership
      FOR INSERT TO authenticated
      WITH CHECK (public.krug_is_owner(krug_id, auth.uid()))$p$;
  END IF;
END $$;

-- Notifikacijski emitter je no-op u harnessu (net.http_post ne postoji).
CREATE OR REPLACE FUNCTION public.krug_emit_notification(
  p_event_type text, p_krug_id uuid, p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL, p_deletion_request_id uuid DEFAULT NULL,
  p_dedup_ref text DEFAULT NULL, p_recipient_override uuid[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
