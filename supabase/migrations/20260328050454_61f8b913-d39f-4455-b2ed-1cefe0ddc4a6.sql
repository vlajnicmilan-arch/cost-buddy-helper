
-- Create project_member_permissions table
CREATE TABLE public.project_member_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tab_key text NOT NULL,
  visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id, tab_key)
);

ALTER TABLE public.project_member_permissions ENABLE ROW LEVEL SECURITY;

-- Members can read their own permissions
CREATE POLICY "Members can view own permissions"
ON public.project_member_permissions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Project owners can read all permissions in their project
CREATE POLICY "Owners can view all permissions"
ON public.project_member_permissions FOR SELECT
TO authenticated
USING (is_project_owner(project_id, auth.uid()));

-- Project owners can insert permissions
CREATE POLICY "Owners can insert permissions"
ON public.project_member_permissions FOR INSERT
TO authenticated
WITH CHECK (is_project_owner(project_id, auth.uid()));

-- Project owners can update permissions
CREATE POLICY "Owners can update permissions"
ON public.project_member_permissions FOR UPDATE
TO authenticated
USING (is_project_owner(project_id, auth.uid()))
WITH CHECK (is_project_owner(project_id, auth.uid()));

-- Project owners can delete permissions
CREATE POLICY "Owners can delete permissions"
ON public.project_member_permissions FOR DELETE
TO authenticated
USING (is_project_owner(project_id, auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_project_member_permissions_updated_at
  BEFORE UPDATE ON public.project_member_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
