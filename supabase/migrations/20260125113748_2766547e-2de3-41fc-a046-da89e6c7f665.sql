-- COMPREHENSIVE SECURITY FIX: All policies must use TO authenticated

-- ============ custom_payment_sources ============
DROP POLICY IF EXISTS "Users can view their own custom payment sources" ON public.custom_payment_sources;
CREATE POLICY "Users can view their own custom payment sources" 
ON public.custom_payment_sources FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own custom payment sources" ON public.custom_payment_sources;
CREATE POLICY "Users can create their own custom payment sources" 
ON public.custom_payment_sources FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own custom payment sources" ON public.custom_payment_sources;
CREATE POLICY "Users can update their own custom payment sources" 
ON public.custom_payment_sources FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own custom payment sources" ON public.custom_payment_sources;
CREATE POLICY "Users can delete their own custom payment sources" 
ON public.custom_payment_sources FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============ notifications ============
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" 
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" 
ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" 
ON public.notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============ custom_categories ============
DROP POLICY IF EXISTS "Users can create their own custom categories" ON public.custom_categories;
CREATE POLICY "Users can create their own custom categories" 
ON public.custom_categories FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own custom categories" ON public.custom_categories;
CREATE POLICY "Users can update their own custom categories" 
ON public.custom_categories FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own custom categories" ON public.custom_categories;
CREATE POLICY "Users can delete their own custom categories" 
ON public.custom_categories FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============ bank_connections ============
DROP POLICY IF EXISTS "Users can create their own bank connections" ON public.bank_connections;
CREATE POLICY "Users can create their own bank connections" 
ON public.bank_connections FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own bank connections" ON public.bank_connections;
CREATE POLICY "Users can update their own bank connections" 
ON public.bank_connections FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own bank connections" ON public.bank_connections;
CREATE POLICY "Users can delete their own bank connections" 
ON public.bank_connections FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============ profiles ============
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view profiles of shared income source members" ON public.profiles;
CREATE POLICY "Users can view profiles of shared income source members" 
ON public.profiles FOR SELECT TO authenticated
USING (EXISTS ( SELECT 1
   FROM (income_source_members ism1
     JOIN income_source_members ism2 ON ((ism1.income_source_id = ism2.income_source_id)))
  WHERE ((ism1.user_id = auth.uid()) AND (ism2.user_id = profiles.user_id))));

DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile" 
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile" 
ON public.profiles FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============ income_sources ============
DROP POLICY IF EXISTS "Users can view their own income sources" ON public.income_sources;
CREATE POLICY "Users can view their own income sources" 
ON public.income_sources FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can view shared income sources" ON public.income_sources;
CREATE POLICY "Members can view shared income sources" 
ON public.income_sources FOR SELECT TO authenticated
USING (is_income_source_member(id, auth.uid()));

DROP POLICY IF EXISTS "Users can create their own income sources" ON public.income_sources;
CREATE POLICY "Users can create their own income sources" 
ON public.income_sources FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own income sources" ON public.income_sources;
CREATE POLICY "Users can update their own income sources" 
ON public.income_sources FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own income sources" ON public.income_sources;
CREATE POLICY "Users can delete their own income sources" 
ON public.income_sources FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============ income_source_members ============
DROP POLICY IF EXISTS "Users can view memberships of sources they belong to" ON public.income_source_members;
CREATE POLICY "Users can view memberships of sources they belong to" 
ON public.income_source_members FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR is_income_source_member(income_source_id, auth.uid()));

DROP POLICY IF EXISTS "Owners can add members" ON public.income_source_members;
CREATE POLICY "Owners can add members" 
ON public.income_source_members FOR INSERT TO authenticated
WITH CHECK ((EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_members.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role)))) OR (EXISTS ( SELECT 1
   FROM income_sources
  WHERE ((income_sources.id = income_source_members.income_source_id) AND (income_sources.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Owners can update member roles" ON public.income_source_members;
CREATE POLICY "Owners can update member roles" 
ON public.income_source_members FOR UPDATE TO authenticated
USING (EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_members.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role))))
WITH CHECK (EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_members.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role))));

DROP POLICY IF EXISTS "Owners can remove members" ON public.income_source_members;
CREATE POLICY "Owners can remove members" 
ON public.income_source_members FOR DELETE TO authenticated
USING (EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_members.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role))));

-- ============ income_source_invitations ============
DROP POLICY IF EXISTS "Owners can create invitations" ON public.income_source_invitations;
CREATE POLICY "Owners can create invitations" 
ON public.income_source_invitations FOR INSERT TO authenticated
WITH CHECK ((EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_invitations.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role)))) OR (EXISTS ( SELECT 1
   FROM income_sources
  WHERE ((income_sources.id = income_source_invitations.income_source_id) AND (income_sources.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Owners can update invitations" ON public.income_source_invitations;
CREATE POLICY "Owners can update invitations" 
ON public.income_source_invitations FOR UPDATE TO authenticated
USING ((invited_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_invitations.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role)))))
WITH CHECK ((invited_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_invitations.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role)))));

DROP POLICY IF EXISTS "Owners can delete invitations" ON public.income_source_invitations;
CREATE POLICY "Owners can delete invitations" 
ON public.income_source_invitations FOR DELETE TO authenticated
USING ((invited_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM income_source_members ism
  WHERE ((ism.income_source_id = income_source_invitations.income_source_id) AND (ism.user_id = auth.uid()) AND (ism.role = 'owner'::income_source_role)))));

-- ============ receipt_items ============
DROP POLICY IF EXISTS "Users can view their own receipt items" ON public.receipt_items;
CREATE POLICY "Users can view their own receipt items" 
ON public.receipt_items FOR SELECT TO authenticated
USING (EXISTS ( SELECT 1 FROM expenses WHERE ((expenses.id = receipt_items.expense_id) AND (expenses.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Users can create receipt items for their expenses" ON public.receipt_items;
CREATE POLICY "Users can create receipt items for their expenses" 
ON public.receipt_items FOR INSERT TO authenticated
WITH CHECK (EXISTS ( SELECT 1 FROM expenses WHERE ((expenses.id = receipt_items.expense_id) AND (expenses.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Users can update their own receipt items" ON public.receipt_items;
CREATE POLICY "Users can update their own receipt items" 
ON public.receipt_items FOR UPDATE TO authenticated
USING (EXISTS ( SELECT 1 FROM expenses WHERE ((expenses.id = receipt_items.expense_id) AND (expenses.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Users can delete their own receipt items" ON public.receipt_items;
CREATE POLICY "Users can delete their own receipt items" 
ON public.receipt_items FOR DELETE TO authenticated
USING (EXISTS ( SELECT 1 FROM expenses WHERE ((expenses.id = receipt_items.expense_id) AND (expenses.user_id = auth.uid()))));

-- ============ transaction_notes ============
DROP POLICY IF EXISTS "Users can view notes on accessible transactions" ON public.transaction_notes;
CREATE POLICY "Users can view notes on accessible transactions" 
ON public.transaction_notes FOR SELECT TO authenticated
USING (EXISTS ( SELECT 1 FROM expenses e
  WHERE ((e.id = transaction_notes.expense_id) AND ((e.user_id = auth.uid()) OR ((e.income_source_id IS NOT NULL) AND is_income_source_member(e.income_source_id, auth.uid()))))));

DROP POLICY IF EXISTS "Users can add notes to accessible transactions" ON public.transaction_notes;
CREATE POLICY "Users can add notes to accessible transactions" 
ON public.transaction_notes FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1 FROM expenses e
  WHERE ((e.id = transaction_notes.expense_id) AND ((e.user_id = auth.uid()) OR ((e.income_source_id IS NOT NULL) AND is_income_source_member(e.income_source_id, auth.uid())))))));

DROP POLICY IF EXISTS "Users can update their own notes" ON public.transaction_notes;
CREATE POLICY "Users can update their own notes" 
ON public.transaction_notes FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notes" ON public.transaction_notes;
CREATE POLICY "Users can delete their own notes" 
ON public.transaction_notes FOR DELETE TO authenticated
USING (auth.uid() = user_id);