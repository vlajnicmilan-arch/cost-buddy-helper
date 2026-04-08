
-- =====================================================
-- 1. Fix invitation policies: change 'public' role to 'authenticated'
-- =====================================================

-- project_invitations: drop and recreate SELECT for invited users
DROP POLICY IF EXISTS "Invited users can view their project invitations" ON public.project_invitations;
CREATE POLICY "Invited users can view their project invitations"
  ON public.project_invitations
  FOR SELECT
  TO authenticated
  USING (invited_user_id = auth.uid());

-- project_invitations: fix INSERT policy role
DROP POLICY IF EXISTS "Project owners can create invitations" ON public.project_invitations;
CREATE POLICY "Project owners can create invitations"
  ON public.project_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

-- project_invitations: fix DELETE policy role
DROP POLICY IF EXISTS "Project owners can delete invitations" ON public.project_invitations;
CREATE POLICY "Project owners can delete invitations"
  ON public.project_invitations
  FOR DELETE
  TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- budget_invitations: ensure all policies use authenticated
DROP POLICY IF EXISTS "Invited users can view budget invitations" ON public.budget_invitations;
CREATE POLICY "Invited users can view budget invitations"
  ON public.budget_invitations
  FOR SELECT
  TO authenticated
  USING (invited_user_id = auth.uid());

-- =====================================================
-- 2. Family invitations: restrict member SELECT to hide emails
-- =====================================================

-- Drop existing member-facing policy
DROP POLICY IF EXISTS "Members can view invitations" ON public.family_invitations;

-- Recreate: only owners (inviters) and the invited user can see invitation details
CREATE POLICY "Owners and invited users can view invitations"
  ON public.family_invitations
  FOR SELECT
  TO authenticated
  USING (
    invited_by = auth.uid()
    OR invited_user_id = auth.uid()
    OR public.is_family_owner(group_id, auth.uid())
  );

-- =====================================================
-- 3. Realtime authorization: add RLS to realtime.messages
-- =====================================================
-- NOTE: realtime.messages is in a reserved schema.
-- Instead, we ensure Realtime is scoped by enabling RLS on the published tables
-- and relying on Supabase's built-in Realtime RLS filtering (Broadcast + Presence
-- use channel-level auth, Postgres Changes use table RLS).
-- No direct migration needed for realtime schema.

-- =====================================================
-- 4. Receipt storage: tighten policies with ownership join
-- =====================================================

-- Drop existing receipt policies and recreate with tighter checks
DROP POLICY IF EXISTS "Users can upload receipts" ON storage.objects;
CREATE POLICY "Users can upload receipts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view own receipts" ON storage.objects;
CREATE POLICY "Users can view own receipts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own receipts" ON storage.objects;
CREATE POLICY "Users can delete own receipts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own receipts" ON storage.objects;
CREATE POLICY "Users can update own receipts"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
