-- Add total_amount and project_id columns to budget_plans
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