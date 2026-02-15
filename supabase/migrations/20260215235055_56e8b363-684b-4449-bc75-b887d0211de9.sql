
-- Allow members to update balance on shared payment sources
CREATE POLICY "Members can update shared payment source balance"
ON public.custom_payment_sources
FOR UPDATE
TO authenticated
USING (
  is_payment_source_member(id, auth.uid())
)
WITH CHECK (
  is_payment_source_member(id, auth.uid())
);
