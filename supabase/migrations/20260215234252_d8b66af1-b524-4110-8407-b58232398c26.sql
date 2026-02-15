
-- Allow shared payment source members to view transactions on that source
CREATE POLICY "Members can view expenses on shared payment sources"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  payment_source IS NOT NULL
  AND (
    is_payment_source_member(
      CASE 
        WHEN payment_source LIKE 'custom:%' THEN REPLACE(payment_source, 'custom:', '')::uuid
        ELSE payment_source::uuid
      END,
      auth.uid()
    )
  )
);
