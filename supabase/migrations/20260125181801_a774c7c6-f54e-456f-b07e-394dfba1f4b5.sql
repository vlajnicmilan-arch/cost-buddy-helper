-- Fix profiles table RLS - ensure authenticated only
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of shared income source members" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view profiles of shared members" 
ON public.profiles FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM income_source_members ism1
    JOIN income_source_members ism2 ON ism1.income_source_id = ism2.income_source_id
    WHERE ism1.user_id = auth.uid() AND ism2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM project_members pm1
    JOIN project_members pm2 ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = auth.uid() AND pm2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM budget_members bm1
    JOIN budget_members bm2 ON bm1.budget_id = bm2.budget_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = profiles.user_id
  )
);

-- Fix bank_connections table RLS - ensure authenticated only
DROP POLICY IF EXISTS "Users can view their own bank connections" ON public.bank_connections;
DROP POLICY IF EXISTS "Users can create their own bank connections" ON public.bank_connections;
DROP POLICY IF EXISTS "Users can update their own bank connections" ON public.bank_connections;
DROP POLICY IF EXISTS "Users can delete their own bank connections" ON public.bank_connections;

CREATE POLICY "Users can view their own bank connections" 
ON public.bank_connections FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bank connections" 
ON public.bank_connections FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bank connections" 
ON public.bank_connections FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bank connections" 
ON public.bank_connections FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Fix budget_invitations table RLS - ensure authenticated only
DROP POLICY IF EXISTS "Owners can view invitations" ON public.budget_invitations;
DROP POLICY IF EXISTS "Owners can create invitations" ON public.budget_invitations;
DROP POLICY IF EXISTS "Owners can update invitations" ON public.budget_invitations;
DROP POLICY IF EXISTS "Owners can delete invitations" ON public.budget_invitations;

CREATE POLICY "Owners can view invitations" 
ON public.budget_invitations FOR SELECT 
TO authenticated
USING (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can create invitations" 
ON public.budget_invitations FOR INSERT 
TO authenticated
WITH CHECK (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can update invitations" 
ON public.budget_invitations FOR UPDATE 
TO authenticated
USING (is_budget_owner(budget_id, auth.uid()));

CREATE POLICY "Owners can delete invitations" 
ON public.budget_invitations FOR DELETE 
TO authenticated
USING (is_budget_owner(budget_id, auth.uid()));

-- Fix income_source_invitations table RLS - ensure authenticated only
DROP POLICY IF EXISTS "Users can view invitations they sent or for sources they own" ON public.income_source_invitations;
DROP POLICY IF EXISTS "Owners can create invitations" ON public.income_source_invitations;
DROP POLICY IF EXISTS "Owners can update invitations" ON public.income_source_invitations;
DROP POLICY IF EXISTS "Owners can delete invitations" ON public.income_source_invitations;

CREATE POLICY "Owners can view invitations" 
ON public.income_source_invitations FOR SELECT 
TO authenticated
USING (
  invited_by = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  )
);

CREATE POLICY "Owners can create invitations" 
ON public.income_source_invitations FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  )
  OR EXISTS (
    SELECT 1 FROM income_sources
    WHERE income_sources.id = income_source_invitations.income_source_id
    AND income_sources.user_id = auth.uid()
  )
);

CREATE POLICY "Owners can update invitations" 
ON public.income_source_invitations FOR UPDATE 
TO authenticated
USING (
  invited_by = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  )
);

CREATE POLICY "Owners can delete invitations" 
ON public.income_source_invitations FOR DELETE 
TO authenticated
USING (
  invited_by = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  )
);

-- Fix project_invitations table RLS - ensure authenticated only
DROP POLICY IF EXISTS "Project owners can view invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project owners can create invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project owners can update invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project owners can delete invitations" ON public.project_invitations;

CREATE POLICY "Project owners can view invitations" 
ON public.project_invitations FOR SELECT 
TO authenticated
USING (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can create invitations" 
ON public.project_invitations FOR INSERT 
TO authenticated
WITH CHECK (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can update invitations" 
ON public.project_invitations FOR UPDATE 
TO authenticated
USING (is_project_owner(project_id, auth.uid()));

CREATE POLICY "Project owners can delete invitations" 
ON public.project_invitations FOR DELETE 
TO authenticated
USING (is_project_owner(project_id, auth.uid()));