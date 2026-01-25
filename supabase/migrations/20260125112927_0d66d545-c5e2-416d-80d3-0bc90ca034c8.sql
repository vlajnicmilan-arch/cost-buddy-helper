-- Drop and recreate SELECT policies with explicit restrictive clause

-- Payment source cards - fix SELECT policy
DROP POLICY IF EXISTS "Users can view their own cards" ON public.payment_source_cards;
CREATE POLICY "Users can view their own cards" 
ON public.payment_source_cards 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Notifications - fix SELECT policy  
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" 
ON public.notifications 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);