-- Bootstrap budget_* tables (missing from earlier migration chain).
--
-- Why this block exists
-- ---------------------
-- The tables budget_plans / budget_members / budget_categories /
-- budget_invitations were created directly on the remote Supabase
-- project before migration tracking was introduced. No prior migration
-- in supabase/migrations/* actually creates them, so a greenfield
-- `supabase db reset` crashes on the ALTER TABLE below with:
--   ERROR: relation "public.budget_plans" does not exist (SQLSTATE 42P01)
-- We backfill the missing baseline here -- right in front of the ALTER --
-- with idempotent CREATE TABLE IF NOT EXISTS + GRANT + RLS enable +
-- minimal own-row policies. On production these are all no-ops (tables
-- already exist, richer policies already applied). On greenfield they
-- let the rest of the chain run.
--
-- Columns intentionally omitted here (added by ALTERs below or by later
-- migrations -- must keep working):
--   * budget_plans.total_amount, project_id  -> this migration, further down
--   * budget_plans.is_recurring              -> 20260222080805

CREATE TABLE IF NOT EXISTS public.budget_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '💰',
  color TEXT DEFAULT '#3b82f6',
  period_type TEXT NOT NULL DEFAULT 'monthly',
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budget_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (budget_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.budget_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  limit_amount NUMERIC NOT NULL DEFAULT 0,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budget_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  invited_user_id UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_plans TO authenticated;
GRANT ALL ON public.budget_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_members TO authenticated;
GRANT ALL ON public.budget_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_categories TO authenticated;
GRANT ALL ON public.budget_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_invitations TO authenticated;
GRANT ALL ON public.budget_invitations TO service_role;

ALTER TABLE public.budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_invitations ENABLE ROW LEVEL SECURITY;

DO $bootstrap_policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budget_plans' AND policyname='Users can view their own budgets') THEN
    CREATE POLICY "Users can view their own budgets" ON public.budget_plans FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budget_plans' AND policyname='Users can create their own budgets') THEN
    CREATE POLICY "Users can create their own budgets" ON public.budget_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budget_plans' AND policyname='Owners can update their budgets') THEN
    CREATE POLICY "Owners can update their budgets" ON public.budget_plans FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budget_plans' AND policyname='Owners can delete their budgets') THEN
    CREATE POLICY "Owners can delete their budgets" ON public.budget_plans FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budget_members' AND policyname='Bootstrap owners manage members') THEN
    CREATE POLICY "Bootstrap owners manage members" ON public.budget_members FOR ALL
      USING (EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.id = budget_id AND bp.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.id = budget_id AND bp.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='Bootstrap owners manage categories') THEN
    CREATE POLICY "Bootstrap owners manage categories" ON public.budget_categories FOR ALL
      USING (EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.id = budget_id AND bp.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.id = budget_id AND bp.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budget_invitations' AND policyname='Bootstrap owners manage invitations') THEN
    CREATE POLICY "Bootstrap owners manage invitations" ON public.budget_invitations FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.id = budget_id AND bp.user_id = auth.uid())
        OR invited_user_id = auth.uid()
      )
      WITH CHECK (EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.id = budget_id AND bp.user_id = auth.uid()));
  END IF;
END
$bootstrap_policies$;

-- Bootstrap helper: is_budget_owner(budget_id, user_id)
-- Missing from historical chain (defined out-of-band on production before
-- migration tracking). Later migrations (20260125181801, 20260326165245,
-- 20260601182733) reference it in RLS policies and function bodies, so
-- greenfield replays crash with:
--   ERROR: function is_budget_owner(uuid, uuid) does not exist
-- Definition mirrors production semantics: SECURITY DEFINER, STABLE,
-- returns true when the given user owns the given budget_plan.
CREATE OR REPLACE FUNCTION public.is_budget_owner(_budget_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $is_budget_owner$
  SELECT EXISTS (
    SELECT 1 FROM public.budget_plans bp
    WHERE bp.id = _budget_id
      AND bp.user_id = _user_id
  );
$is_budget_owner$;

REVOKE ALL ON FUNCTION public.is_budget_owner(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_budget_owner(uuid, uuid) TO authenticated, service_role;

-- Original migration body: add total_amount and project_id columns.
ALTER TABLE public.budget_plans 
ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.budget_plans 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Add trigger to automatically add budget owner as member
CREATE OR REPLACE FUNCTION public.add_budget_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.budget_members (budget_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (budget_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS on_budget_created ON public.budget_plans;
CREATE TRIGGER on_budget_created
  AFTER INSERT ON public.budget_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.add_budget_owner_as_member();

-- Backfill existing budgets - add owners as members
INSERT INTO public.budget_members (budget_id, user_id, role)
SELECT id, user_id, 'owner'
FROM public.budget_plans
ON CONFLICT (budget_id, user_id) DO NOTHING;
