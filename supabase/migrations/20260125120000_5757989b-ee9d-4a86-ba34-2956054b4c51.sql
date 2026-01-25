-- Create project roles enum
CREATE TYPE public.project_role AS ENUM ('manager', 'member', 'viewer');

-- Create project status enum  
CREATE TYPE public.project_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');

-- Create milestone status enum
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue');

-- ===========================================
-- PROJECTS TABLE - Main project entity
-- ===========================================
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#3b82f6',
  status project_status NOT NULL DEFAULT 'draft',
  total_budget NUMERIC NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- PROJECT MEMBERS TABLE - Team management with roles
-- ===========================================
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role project_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- ===========================================
-- PROJECT MILESTONES - Phases with budgets and deadlines
-- ===========================================
CREATE TABLE public.project_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  budget NUMERIC NOT NULL DEFAULT 0,
  status milestone_status NOT NULL DEFAULT 'pending',
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- PROJECT FUNDING - Link projects to income sources
-- ===========================================
CREATE TABLE public.project_funding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  income_source_id UUID NOT NULL REFERENCES public.income_sources(id) ON DELETE CASCADE,
  allocated_amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (project_id, income_source_id)
);

-- ===========================================
-- PROJECT INVITATIONS - Invite system
-- ===========================================
CREATE TABLE public.project_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role project_role NOT NULL DEFAULT 'member',
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- ADD project_id TO EXPENSES TABLE
-- ===========================================
ALTER TABLE public.expenses ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL;

-- ===========================================
-- HELPER FUNCTIONS (must come before RLS policies)
-- ===========================================

-- Helper function to check project membership
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id
      AND user_id = _user_id
  )
$$;

-- Helper function to check if user is project manager
CREATE OR REPLACE FUNCTION public.is_project_manager(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND role = 'manager'
  ) OR EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = _project_id
      AND user_id = _user_id
  )
$$;

-- ===========================================
-- ENABLE RLS ON ALL TABLES
-- ===========================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_funding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RLS POLICIES FOR PROJECTS
-- ===========================================
CREATE POLICY "Users can view their own projects"
ON public.projects FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Members can view shared projects"
ON public.projects FOR SELECT TO authenticated
USING (is_project_member(id, auth.uid()));

CREATE POLICY "Users can create their own projects"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their projects"
ON public.projects FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their projects"
ON public.projects FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ===========================================
-- RLS POLICIES FOR PROJECT_MEMBERS
-- ===========================================
CREATE POLICY "Members can view project memberships"
ON public.project_members FOR SELECT TO authenticated
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Managers can add members"
ON public.project_members FOR INSERT TO authenticated
WITH CHECK (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can update member roles"
ON public.project_members FOR UPDATE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can remove members"
ON public.project_members FOR DELETE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

-- ===========================================
-- RLS POLICIES FOR PROJECT_MILESTONES
-- ===========================================
CREATE POLICY "Members can view milestones"
ON public.project_milestones FOR SELECT TO authenticated
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Managers can create milestones"
ON public.project_milestones FOR INSERT TO authenticated
WITH CHECK (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can update milestones"
ON public.project_milestones FOR UPDATE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can delete milestones"
ON public.project_milestones FOR DELETE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

-- ===========================================
-- RLS POLICIES FOR PROJECT_FUNDING
-- ===========================================
CREATE POLICY "Members can view project funding"
ON public.project_funding FOR SELECT TO authenticated
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Managers can manage funding"
ON public.project_funding FOR INSERT TO authenticated
WITH CHECK (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can update funding"
ON public.project_funding FOR UPDATE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can delete funding"
ON public.project_funding FOR DELETE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

-- ===========================================
-- RLS POLICIES FOR PROJECT_INVITATIONS
-- ===========================================
CREATE POLICY "Managers can view invitations"
ON public.project_invitations FOR SELECT TO authenticated
USING (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can create invitations"
ON public.project_invitations FOR INSERT TO authenticated
WITH CHECK (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can update invitations"
ON public.project_invitations FOR UPDATE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

CREATE POLICY "Managers can delete invitations"
ON public.project_invitations FOR DELETE TO authenticated
USING (is_project_manager(project_id, auth.uid()));

-- ===========================================
-- UPDATE EXPENSES RLS POLICIES
-- ===========================================
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can view their own expenses"
ON public.expenses FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id) OR 
  ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())) OR
  ((project_id IS NOT NULL) AND is_project_member(project_id, auth.uid()))
);

DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
CREATE POLICY "Users can create their own expenses"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id) OR 
  ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())) OR
  ((project_id IS NOT NULL) AND is_project_member(project_id, auth.uid()))
);

DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id) OR 
  ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)) OR
  ((project_id IS NOT NULL) AND is_project_manager(project_id, auth.uid()))
)
WITH CHECK (
  (auth.uid() = user_id) OR 
  ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)) OR
  ((project_id IS NOT NULL) AND is_project_manager(project_id, auth.uid()))
);

DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses"
ON public.expenses FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id) OR 
  ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)) OR
  ((project_id IS NOT NULL) AND is_project_manager(project_id, auth.uid()))
);

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Auto-add owner as manager when project is created
CREATE OR REPLACE FUNCTION public.add_project_owner_as_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'manager')
  ON CONFLICT (project_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.add_project_owner_as_manager();

-- Update updated_at triggers
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_funding_updated_at
  BEFORE UPDATE ON public.project_funding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_milestones_updated_at
  BEFORE UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();