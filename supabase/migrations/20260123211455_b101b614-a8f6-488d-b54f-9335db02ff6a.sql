-- 1. Fix notifications INSERT policy - restrict to service role only (edge functions)
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can create notifications for users" ON public.notifications;

-- Create a more restrictive policy - only authenticated service can insert
-- Note: Edge functions use service role key which bypasses RLS, so this policy
-- ensures regular users cannot insert notifications for others
CREATE POLICY "Prevent direct notification inserts by users"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 2. Add UPDATE policy for transaction_notes so users can edit their notes
CREATE POLICY "Users can update their own notes"
ON public.transaction_notes
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);