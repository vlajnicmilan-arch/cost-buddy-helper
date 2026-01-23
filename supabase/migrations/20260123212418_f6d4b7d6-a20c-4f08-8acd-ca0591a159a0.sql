-- 1. CRITICAL: Fix income_source_invitations - already has proper SELECT policy, 
-- but we need UPDATE policy for owners only
CREATE POLICY "Owners can update invitations"
ON public.income_source_invitations
FOR UPDATE
USING (
  (invited_by = auth.uid()) OR 
  (EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id 
    AND ism.user_id = auth.uid() 
    AND ism.role = 'owner'
  ))
)
WITH CHECK (
  (invited_by = auth.uid()) OR 
  (EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id 
    AND ism.user_id = auth.uid() 
    AND ism.role = 'owner'
  ))
);

-- 2. Add UPDATE policy for income_source_members - only owners can modify roles
CREATE POLICY "Owners can update member roles"
ON public.income_source_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_members.income_source_id 
    AND ism.user_id = auth.uid() 
    AND ism.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM income_source_members ism
    WHERE ism.income_source_id = income_source_members.income_source_id 
    AND ism.user_id = auth.uid() 
    AND ism.role = 'owner'
  )
);

-- 3. Fix expenses UPDATE policy - only creator or owner can update
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses"
ON public.expenses
FOR UPDATE
USING (
  (auth.uid() = user_id) OR 
  (
    income_source_id IS NOT NULL AND 
    is_income_source_owner(auth.uid(), income_source_id)
  )
)
WITH CHECK (
  (auth.uid() = user_id) OR 
  (
    income_source_id IS NOT NULL AND 
    is_income_source_owner(auth.uid(), income_source_id)
  )
);

-- 4. Fix expenses DELETE policy - only creator or owner can delete
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses"
ON public.expenses
FOR DELETE
USING (
  (auth.uid() = user_id) OR 
  (
    income_source_id IS NOT NULL AND 
    is_income_source_owner(auth.uid(), income_source_id)
  )
);