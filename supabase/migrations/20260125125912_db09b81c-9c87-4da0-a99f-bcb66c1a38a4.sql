-- First drop the RLS policies that depend on project_id
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;

-- Drop project-related tables (order matters for foreign keys)
DROP TABLE IF EXISTS public.project_funding CASCADE;
DROP TABLE IF EXISTS public.project_invitations CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.project_milestones CASCADE;

-- Update expenses table to remove project references
ALTER TABLE public.expenses DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS milestone_id;

-- Drop projects table
DROP TABLE IF EXISTS public.projects CASCADE;

-- Drop project-related functions
DROP FUNCTION IF EXISTS public.is_project_member CASCADE;
DROP FUNCTION IF EXISTS public.is_project_manager CASCADE;
DROP FUNCTION IF EXISTS public.add_project_owner_as_manager CASCADE;

-- Recreate RLS policies for expenses without project references
CREATE POLICY "Users can view their own expenses"
  ON public.expenses FOR SELECT
  USING (
    (auth.uid() = user_id) OR 
    ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid()))
  );

CREATE POLICY "Users can create their own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id) OR 
    ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid()))
  );

CREATE POLICY "Users can update their own expenses"
  ON public.expenses FOR UPDATE
  USING (
    (auth.uid() = user_id) OR 
    ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
  )
  WITH CHECK (
    (auth.uid() = user_id) OR 
    ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
  );

CREATE POLICY "Users can delete their own expenses"
  ON public.expenses FOR DELETE
  USING (
    (auth.uid() = user_id) OR 
    ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
  );

-- Create budget_plans table (main budget container)
CREATE TABLE public.budget_plans (
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create budget_categories table (category limits within a budget)
CREATE TABLE public.budget_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  limit_amount NUMERIC NOT NULL DEFAULT 0,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(budget_id, category)
);

-- Create savings_goals table
CREATE TABLE public.savings_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🎯',
  color TEXT DEFAULT '#22c55e',
  target_amount NUMERIC NOT NULL DEFAULT 0,
  current_amount NUMERIC NOT NULL DEFAULT 0,
  target_date DATE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create budget_members table for sharing
CREATE TABLE public.budget_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(budget_id, user_id)
);

-- Create budget_invitations table
CREATE TABLE public.budget_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_invitations ENABLE ROW LEVEL SECURITY;

-- Helper function to check budget membership
CREATE OR REPLACE FUNCTION public.is_budget_member(_budget_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.budget_members
    WHERE budget_id = _budget_id
      AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.budget_plans
    WHERE id = _budget_id
      AND user_id = _user_id
  )
$$;

-- Helper function to check if user is budget owner
CREATE OR REPLACE FUNCTION public.is_budget_owner(_budget_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.budget_members
    WHERE budget_id = _budget_id
      AND user_id = _user_id
      AND role = 'owner'
  ) OR EXISTS (
    SELECT 1
    FROM public.budget_plans
    WHERE id = _budget_id
      AND user_id = _user_id
  )
$$;

-- Trigger to add owner as member when budget is created
CREATE OR REPLACE FUNCTION public.add_budget_owner_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.budget_members (budget_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (budget_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_budget_created
  AFTER INSERT ON public.budget_plans
  FOR EACH ROW EXECUTE FUNCTION public.add_budget_owner_as_member();

-- RLS Policies for budget_plans
CREATE POLICY "Users can create their own budgets"
  ON public.budget_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own budgets"
  ON public.budget_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Members can view shared budgets"
  ON public.budget_plans FOR SELECT
  USING (is_budget_member(id, auth.uid()));

CREATE POLICY "Owners can update their budgets"
  ON public.budget_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their budgets"
  ON public.budget_plans FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for budget_categories
CREATE POLICY "Members can view budget categories"
  ON public.budget_categories FOR SELECT
  USING (is_budget_member(budget_id, auth.uid()));

CREATE POLICY "Owners can manage budget categories"
  ON public.budget_categories FOR INSERT
  WITH CHECK (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can update budget categories"
  ON public.budget_categories FOR UPDATE
  USING (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can delete budget categories"
  ON public.budget_categories FOR DELETE
  USING (is_budget_owner(budget_id, auth.uid()));

-- RLS Policies for savings_goals
CREATE POLICY "Members can view savings goals"
  ON public.savings_goals FOR SELECT
  USING (is_budget_member(budget_id, auth.uid()));

CREATE POLICY "Owners can create savings goals"
  ON public.savings_goals FOR INSERT
  WITH CHECK (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can update savings goals"
  ON public.savings_goals FOR UPDATE
  USING (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can delete savings goals"
  ON public.savings_goals FOR DELETE
  USING (is_budget_owner(budget_id, auth.uid()));

-- RLS Policies for budget_members
CREATE POLICY "Members can view budget memberships"
  ON public.budget_members FOR SELECT
  USING (is_budget_member(budget_id, auth.uid()));

CREATE POLICY "Owners can add members"
  ON public.budget_members FOR INSERT
  WITH CHECK (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can update members"
  ON public.budget_members FOR UPDATE
  USING (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can remove members"
  ON public.budget_members FOR DELETE
  USING (is_budget_owner(budget_id, auth.uid()));

-- RLS Policies for budget_invitations
CREATE POLICY "Owners can view invitations"
  ON public.budget_invitations FOR SELECT
  USING (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can create invitations"
  ON public.budget_invitations FOR INSERT
  WITH CHECK (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can update invitations"
  ON public.budget_invitations FOR UPDATE
  USING (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can delete invitations"
  ON public.budget_invitations FOR DELETE
  USING (is_budget_owner(budget_id, auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_budget_plans_updated_at
  BEFORE UPDATE ON public.budget_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budget_categories_updated_at
  BEFORE UPDATE ON public.budget_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_savings_goals_updated_at
  BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();