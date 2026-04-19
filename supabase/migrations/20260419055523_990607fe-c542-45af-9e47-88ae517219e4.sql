-- 1) Add default_permissions to project_invitations
ALTER TABLE public.project_invitations
  ADD COLUMN IF NOT EXISTS default_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Allow members to update their own row in project_members (only context fields)
-- Drop existing self-update policy if present
DROP POLICY IF EXISTS "Members can update own context" ON public.project_members;

CREATE POLICY "Members can update own context"
ON public.project_members
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
