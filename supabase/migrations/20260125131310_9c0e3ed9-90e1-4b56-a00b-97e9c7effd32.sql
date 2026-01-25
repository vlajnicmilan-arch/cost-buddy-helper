-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#3b82f6',
  status TEXT NOT NULL DEFAULT 'draft',
  total_budget NUMERIC NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policies for projects
CREATE POLICY "Users can view their own projects" 
ON public.projects FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects" 
ON public.projects FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" 
ON public.projects FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" 
ON public.projects FOR DELETE 
USING (auth.uid() = user_id);

-- Create project_members table
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  display_name TEXT,
  UNIQUE(project_id, user_id)
);

-- Enable RLS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Helper function to check project ownership
CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = _project_id AND user_id = _user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper function to check project membership
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Policies for project_members
CREATE POLICY "Project members can view memberships"
ON public.project_members FOR SELECT
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project owners can add members"
ON public.project_members FOR INSERT
WITH CHECK (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can update members"
ON public.project_members FOR UPDATE
USING (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can remove members"
ON public.project_members FOR DELETE
USING (is_project_owner(project_id, auth.uid()));

-- Members can also view projects they belong to
CREATE POLICY "Members can view shared projects"
ON public.projects FOR SELECT
USING (is_project_member(id, auth.uid()));

-- Create project_milestones table
CREATE TABLE public.project_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  budget NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

-- Policies for project_milestones
CREATE POLICY "Project members can view milestones"
ON public.project_milestones FOR SELECT
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project owners can create milestones"
ON public.project_milestones FOR INSERT
WITH CHECK (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can update milestones"
ON public.project_milestones FOR UPDATE
USING (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can delete milestones"
ON public.project_milestones FOR DELETE
USING (is_project_owner(project_id, auth.uid()));

-- Create project_funding table
CREATE TABLE public.project_funding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  income_source_id UUID NOT NULL,
  allocated_amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, income_source_id)
);

-- Enable RLS
ALTER TABLE public.project_funding ENABLE ROW LEVEL SECURITY;

-- Policies for project_funding
CREATE POLICY "Project members can view funding"
ON public.project_funding FOR SELECT
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project owners can manage funding"
ON public.project_funding FOR INSERT
WITH CHECK (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can update funding"
ON public.project_funding FOR UPDATE
USING (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can delete funding"
ON public.project_funding FOR DELETE
USING (is_project_owner(project_id, auth.uid()));

-- Create project_invitations table
CREATE TABLE public.project_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- Policies for project_invitations
CREATE POLICY "Project owners can view invitations"
ON public.project_invitations FOR SELECT
USING (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can create invitations"
ON public.project_invitations FOR INSERT
WITH CHECK (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can update invitations"
ON public.project_invitations FOR UPDATE
USING (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can delete invitations"
ON public.project_invitations FOR DELETE
USING (is_project_owner(project_id, auth.uid()));

-- Add project_id column to expenses table for project transactions
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL;

-- Update expenses RLS to allow project members to view/create project expenses
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can view their own expenses"
ON public.expenses FOR SELECT
USING (
  (auth.uid() = user_id) OR 
  ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())) OR
  ((project_id IS NOT NULL) AND is_project_member(project_id, auth.uid()))
);

DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
CREATE POLICY "Users can create their own expenses"
ON public.expenses FOR INSERT
WITH CHECK (
  (auth.uid() = user_id) OR 
  ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())) OR
  ((project_id IS NOT NULL) AND is_project_member(project_id, auth.uid()))
);

-- Create trigger for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_milestones_updated_at
BEFORE UPDATE ON public.project_milestones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_funding_updated_at
BEFORE UPDATE ON public.project_funding
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();