
-- Drop the unsafe policy
DROP POLICY IF EXISTS "Members can view expenses on shared payment sources" ON public.expenses;

-- Create a safe version that only casts to UUID when the value looks like a UUID
CREATE POLICY "Members can view expenses on shared payment sources"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  payment_source IS NOT NULL
  AND (
    -- Only attempt UUID matching when payment_source looks like a UUID (with or without custom: prefix)
    CASE 
      WHEN payment_source LIKE 'custom:%' AND REPLACE(payment_source, 'custom:', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN is_payment_source_member(REPLACE(payment_source, 'custom:', '')::uuid, auth.uid())
      WHEN payment_source ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN is_payment_source_member(payment_source::uuid, auth.uid())
      ELSE false
    END
  )
);
