
-- Helper function: check if user has 'full' access on a payment source
CREATE OR REPLACE FUNCTION public.has_full_payment_source_access(_source_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Owner always has full access
  SELECT EXISTS (
    SELECT 1 FROM custom_payment_sources
    WHERE id = _source_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM payment_source_members
    WHERE payment_source_id = _source_id 
      AND user_id = _user_id 
      AND role = 'full'
  );
$$;

-- Drop the old SELECT policy for shared payment sources
DROP POLICY IF EXISTS "Members can view expenses on shared payment sources" ON public.expenses;

-- Recreate with role-based logic:
-- 'full' members and owners see ALL transactions on that payment source
-- 'limited' (or legacy 'member') members see only their OWN transactions
CREATE POLICY "Members can view expenses on shared payment sources"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  payment_source IS NOT NULL AND
  CASE
    WHEN payment_source LIKE 'custom:%' 
         AND replace(payment_source, 'custom:', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      -- Full access: owner or 'full' role → see all
      has_full_payment_source_access(replace(payment_source, 'custom:', '')::uuid, auth.uid())
      OR
      -- Limited access: member but only own transactions
      (auth.uid() = user_id AND is_payment_source_member(replace(payment_source, 'custom:', '')::uuid, auth.uid()))
    WHEN payment_source ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      has_full_payment_source_access(payment_source::uuid, auth.uid())
      OR
      (auth.uid() = user_id AND is_payment_source_member(payment_source::uuid, auth.uid()))
    ELSE false
  END
);
