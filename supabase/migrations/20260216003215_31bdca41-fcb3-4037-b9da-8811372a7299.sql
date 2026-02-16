
-- Allow users to see transfer transactions where their payment source is the destination
CREATE POLICY "Members can view inbound transfers to their payment sources"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  type = 'transfer' AND
  income_source_id IS NOT NULL AND
  (
    -- Owner of destination payment source
    is_payment_source_owner(income_source_id::uuid, auth.uid())
    OR
    -- Full access member of destination payment source
    has_full_payment_source_access(income_source_id::uuid, auth.uid())
    OR
    -- Limited member who created the transfer themselves
    (auth.uid() = user_id AND is_payment_source_member(income_source_id::uuid, auth.uid()))
  )
);
