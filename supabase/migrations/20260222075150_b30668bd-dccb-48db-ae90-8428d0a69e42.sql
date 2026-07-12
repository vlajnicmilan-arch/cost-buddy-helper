-- =====================================================================
-- BOOTSTRAP (greenfield-only, no-op on production)
-- ---------------------------------------------------------------------
-- public.savings_goals was created out-of-band on the remote database
-- before migration tracking existed. No prior migration in this chain
-- defines it, so a clean `supabase db reset` crashes here with
-- `relation "public.savings_goals" does not exist`.
--
-- We recreate the *pre-this-migration* shape (budget_id NOT NULL, no
-- user_id column) so the ALTERs below stay meaningful on greenfield.
-- IF NOT EXISTS makes the block a no-op on production, where the table
-- (and everything added below) already exists. supabase_migrations
-- bookkeeping is preserved because the file id/path/name is unchanged.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id uuid NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  target_amount numeric NOT NULL DEFAULT 0,
  current_amount numeric NOT NULL DEFAULT 0,
  target_date date,
  is_completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

-- Make budget_id nullable for standalone savings goals
ALTER TABLE public.savings_goals ALTER COLUMN budget_id DROP NOT NULL;

-- Add user_id column for standalone goals (IF NOT EXISTS for greenfield replays)
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill user_id from budget owner
UPDATE public.savings_goals sg
SET user_id = bp.user_id
FROM public.budget_plans bp
WHERE sg.budget_id = bp.id
  AND sg.user_id IS NULL;

-- Add RLS policies for standalone goals (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='savings_goals' AND policyname='Users can view their own savings goals') THEN
    CREATE POLICY "Users can view their own savings goals"
      ON public.savings_goals FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='savings_goals' AND policyname='Users can create their own savings goals') THEN
    CREATE POLICY "Users can create their own savings goals"
      ON public.savings_goals FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='savings_goals' AND policyname='Users can update their own savings goals') THEN
    CREATE POLICY "Users can update their own savings goals"
      ON public.savings_goals FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='savings_goals' AND policyname='Users can delete their own savings goals') THEN
    CREATE POLICY "Users can delete their own savings goals"
      ON public.savings_goals FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
