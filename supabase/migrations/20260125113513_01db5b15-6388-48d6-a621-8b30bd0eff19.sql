-- Ensure ALL policies on payment_source_cards use TO authenticated
DROP POLICY IF EXISTS "Users can create their own cards" ON public.payment_source_cards;
CREATE POLICY "Users can create their own cards" 
ON public.payment_source_cards 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own cards" ON public.payment_source_cards;
CREATE POLICY "Users can update their own cards" 
ON public.payment_source_cards 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own cards" ON public.payment_source_cards;
CREATE POLICY "Users can delete their own cards" 
ON public.payment_source_cards 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Ensure ALL policies on expenses use TO authenticated
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
CREATE POLICY "Users can create their own expenses" 
ON public.expenses 
FOR INSERT 
TO authenticated
WITH CHECK ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_member(income_source_id, auth.uid())));

DROP POLICY IF EXISTS "Members can add transactions to shared sources" ON public.expenses;

DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses" 
ON public.expenses 
FOR UPDATE 
TO authenticated
USING ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)))
WITH CHECK ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)));

DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses" 
ON public.expenses 
FOR DELETE 
TO authenticated
USING ((auth.uid() = user_id) OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id)));