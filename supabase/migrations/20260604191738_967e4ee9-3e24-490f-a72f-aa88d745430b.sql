-- T1: Core Krug schema (Implementation Sprint v1.1)
-- Tables: krug, krug_ownership, krug_membership
-- Enums per zaključanom modelu (NO 'family' preset; owner NIJE membership role)

CREATE TYPE public.krug_preset AS ENUM (
  'partner',
  'su_roditelj',
  'cimer',
  'putovanje',
  'projekt',
  'klub'
);

CREATE TYPE public.krug_membership_role AS ENUM (
  'punopravni',
  'obicni'
);

CREATE TYPE public.krug_lifecycle_state AS ENUM (
  'active',
  'early_signal',
  'ugrozen',
  'continuity_window',
  'read_only',
  'deleted'
);

-- KRUG
CREATE TABLE public.krug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  preset public.krug_preset NOT NULL,
  lifecycle_state public.krug_lifecycle_state NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.krug TO authenticated;
GRANT ALL ON public.krug TO service_role;
ALTER TABLE public.krug ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER krug_set_updated_at
  BEFORE UPDATE ON public.krug
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Preset freeze: zabrana promjene presetove nakon kreiranja (Preset Constraint Matrix v1)
CREATE OR REPLACE FUNCTION public.krug_freeze_preset()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.preset IS DISTINCT FROM OLD.preset THEN
    RAISE EXCEPTION 'krug.preset is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER krug_freeze_preset
  BEFORE UPDATE ON public.krug
  FOR EACH ROW EXECUTE FUNCTION public.krug_freeze_preset();

CREATE INDEX idx_krug_lifecycle_state ON public.krug(lifecycle_state) WHERE deleted_at IS NULL;

-- KRUG_OWNERSHIP (owner = JEDAN po krugu u v1; owner NIJE u membershipu kao 'owner')
CREATE TABLE public.krug_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT krug_ownership_unique_per_krug UNIQUE (krug_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.krug_ownership TO authenticated;
GRANT ALL ON public.krug_ownership TO service_role;
ALTER TABLE public.krug_ownership ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER krug_ownership_set_updated_at
  BEFORE UPDATE ON public.krug_ownership
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_krug_ownership_user ON public.krug_ownership(user_id);

-- KRUG_MEMBERSHIP (samo 'punopravni' | 'obicni'; owner se NE upisuje s rolom 'owner')
CREATE TABLE public.krug_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.krug_membership_role NOT NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT krug_membership_unique_user_per_krug UNIQUE (krug_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.krug_membership TO authenticated;
GRANT ALL ON public.krug_membership TO service_role;
ALTER TABLE public.krug_membership ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER krug_membership_set_updated_at
  BEFORE UPDATE ON public.krug_membership
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_krug_membership_user ON public.krug_membership(user_id);
CREATE INDEX idx_krug_membership_krug ON public.krug_membership(krug_id);

-- Creator INSERT trigger: kreator -> krug_ownership + krug_membership('punopravni')
-- Eksplicitno: NIKAD ne piše rolu 'owner' u membership.
CREATE OR REPLACE FUNCTION public.krug_bootstrap_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.krug_ownership (krug_id, user_id)
  VALUES (NEW.id, NEW.created_by);

  INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'punopravni'::public.krug_membership_role, NEW.created_by);

  RETURN NEW;
END;
$$;

CREATE TRIGGER krug_bootstrap_creator
  AFTER INSERT ON public.krug
  FOR EACH ROW EXECUTE FUNCTION public.krug_bootstrap_creator();
