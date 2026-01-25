-- Fix security: Add explicit authentication requirement to expenses table policies
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;

CREATE POLICY "Users can view their own expenses" 
ON public.expenses 
FOR SELECT 
TO authenticated
USING ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())) OR ((project_id IS NOT NULL) AND is_project_member(project_id, auth.uid())));

CREATE POLICY "Users can create their own expenses" 
ON public.expenses 
FOR INSERT 
TO authenticated
WITH CHECK ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())) OR ((project_id IS NOT NULL) AND is_project_member(project_id, auth.uid())));

CREATE POLICY "Users can update their own expenses" 
ON public.expenses 
FOR UPDATE 
TO authenticated
USING ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)))
WITH CHECK ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)));

CREATE POLICY "Users can delete their own expenses" 
ON public.expenses 
FOR DELETE 
TO authenticated
USING ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)));

-- Fix security: Add explicit authentication requirement to profiles table policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of shared income source members" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view profiles of shared income source members" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (EXISTS ( SELECT 1
   FROM (income_source_members ism1
     JOIN income_source_members ism2 ON ((ism1.income_source_id = ism2.income_source_id)))
  WHERE ((ism1.user_id = auth.uid()) AND (ism2.user_id = profiles.user_id))));

CREATE POLICY "Users can create their own profile" 
ON public.profiles 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);