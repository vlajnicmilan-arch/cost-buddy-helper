-- First, drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view memberships of sources they belong to" ON public.income_source_members;
DROP POLICY IF EXISTS "Members can view source transactions" ON public.expenses;
DROP POLICY IF EXISTS "Members can add transactions to shared sources" ON public.expenses;

-- Create a SECURITY DEFINER function to check membership (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_income_source_member(_source_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.income_source_members
    WHERE income_source_id = _source_id
      AND user_id = _user_id
  )
$$;

-- Recreate membership view policy using the function
CREATE POLICY "Users can view memberships of sources they belong to"
ON public.income_source_members
FOR SELECT
USING (
  user_id = auth.uid() 
  OR public.is_income_source_member(income_source_id, auth.uid())
);

-- Recreate expenses SELECT policy for shared sources using the function
CREATE POLICY "Members can view source transactions"
ON public.expenses
FOR SELECT
USING (
  auth.uid() = user_id 
  OR (
    income_source_id IS NOT NULL 
    AND public.is_income_source_member(income_source_id, auth.uid())
  )
);

-- Recreate expenses INSERT policy for shared sources using the function
CREATE POLICY "Members can add transactions to shared sources"
ON public.expenses
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  OR (
    income_source_id IS NOT NULL 
    AND public.is_income_source_member(income_source_id, auth.uid())
  )
);