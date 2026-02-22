
-- Make budget_id nullable for standalone savings goals
ALTER TABLE public.savings_goals ALTER COLUMN budget_id DROP NOT NULL;

-- Add user_id column for standalone goals
ALTER TABLE public.savings_goals ADD COLUMN user_id uuid;

-- Backfill user_id from budget owner
UPDATE public.savings_goals sg
SET user_id = bp.user_id
FROM public.budget_plans bp
WHERE sg.budget_id = bp.id;

-- Add RLS policies for standalone goals
CREATE POLICY "Users can view their own savings goals"
ON public.savings_goals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own savings goals"
ON public.savings_goals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own savings goals"
ON public.savings_goals FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own savings goals"
ON public.savings_goals FOR DELETE
USING (auth.uid() = user_id);
