-- Fix all SELECT policies to explicitly require authentication

-- 1. custom_categories
DROP POLICY IF EXISTS "Users can view their own custom categories" ON public.custom_categories;
CREATE POLICY "Users can view their own custom categories" 
ON public.custom_categories 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- 2. expenses - drop both existing SELECT policies and recreate
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can view source transactions" ON public.expenses;
CREATE POLICY "Users can view their own expenses" 
ON public.expenses 
FOR SELECT 
TO authenticated
USING ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())));

-- 3. bank_connections
DROP POLICY IF EXISTS "Users can view their own bank connections" ON public.bank_connections;
CREATE POLICY "Users can view their own bank connections" 
ON public.bank_connections 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- 4. income_source_invitations
DROP POLICY IF EXISTS "Users can view invitations they sent or for sources they own" ON public.income_source_invitations;
CREATE POLICY "Users can view invitations they sent or for sources they own" 
ON public.income_source_invitations 
FOR SELECT 
TO authenticated
USING ((invited_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_invitations.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role)))));

-- 5. payment_source_cards (already fixed but recreate to be sure)
DROP POLICY IF EXISTS "Users can view their own cards" ON public.payment_source_cards;
CREATE POLICY "Users can view their own cards" 
ON public.payment_source_cards 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);