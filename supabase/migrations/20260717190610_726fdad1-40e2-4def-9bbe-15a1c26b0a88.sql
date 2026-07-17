-- =============================================================
-- §4.5 — RLS Write Refit
-- Milanove odluke: Krug UPDATE zaključan; DELETE bez gate-a; membership propušta.
-- Krug per-expense DELETE gate — ostavljen za zasebnu mini-fazu.
-- Rollback skript je u komentaru na dnu ove migracije.
-- =============================================================

-- 0) Zajednički helper
CREATE OR REPLACE FUNCTION public.can_write_module(_user uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user IS NOT NULL
    AND (
      public.has_entitlement(_user, _module)
      OR public.has_role(_user, 'admin'::app_role)
    )
$$;

REVOKE ALL ON FUNCTION public.can_write_module(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_module(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_write_module(uuid, text) TO authenticated, service_role;

-- =============================================================
-- KRUG
-- =============================================================
DROP POLICY IF EXISTS "krug_insert_authenticated" ON public.krug;
CREATE POLICY "krug_insert_authenticated" ON public.krug
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.can_write_module(auth.uid(), 'krug')
  );

DROP POLICY IF EXISTS "krug_update_owner" ON public.krug;
CREATE POLICY "krug_update_owner" ON public.krug
  FOR UPDATE TO authenticated
  USING (krug_is_owner(id, auth.uid()))
  WITH CHECK (
    krug_is_owner(id, auth.uid())
    AND public.can_write_module(auth.uid(), 'krug')
  );

DROP POLICY IF EXISTS "krug_membership_insert_owner" ON public.krug_membership;
CREATE POLICY "krug_membership_insert_owner" ON public.krug_membership
  FOR INSERT TO authenticated
  WITH CHECK (
    krug_is_owner(krug_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'krug')
  );

DROP POLICY IF EXISTS "krug_membership_update_owner" ON public.krug_membership;
CREATE POLICY "krug_membership_update_owner" ON public.krug_membership
  FOR UPDATE TO authenticated
  USING (krug_is_owner(krug_id, auth.uid()))
  WITH CHECK (
    krug_is_owner(krug_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'krug')
  );

-- =============================================================
-- PROJEKTI
-- =============================================================
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
CREATE POLICY "Users can create their own projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
CREATE POLICY "Users can update their own projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can insert members" ON public.project_members;
CREATE POLICY "Project owners can insert members" ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can update members" ON public.project_members;
CREATE POLICY "Project owners can update members" ON public.project_members
  FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can add workers" ON public.project_workers;
CREATE POLICY "Project owners can add workers" ON public.project_workers
  FOR INSERT TO authenticated
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can update workers" ON public.project_workers;
CREATE POLICY "Project owners can update workers" ON public.project_workers
  FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can create collaborators" ON public.project_collaborators;
CREATE POLICY "Project owners can create collaborators" ON public.project_collaborators
  FOR INSERT TO authenticated
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can update collaborators" ON public.project_collaborators;
CREATE POLICY "Project owners can update collaborators" ON public.project_collaborators
  FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can create milestones" ON public.project_milestones;
CREATE POLICY "Project owners can create milestones" ON public.project_milestones
  FOR INSERT TO authenticated
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

DROP POLICY IF EXISTS "Project owners can update milestones" ON public.project_milestones;
CREATE POLICY "Project owners can update milestones" ON public.project_milestones
  FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()))
  WITH CHECK (
    is_project_owner(project_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'projekti')
  );

-- =============================================================
-- BIZNIS
-- =============================================================
DROP POLICY IF EXISTS "Users can create their own business profile" ON public.business_profiles;
CREATE POLICY "Users can create their own business profile" ON public.business_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'biznis'));

DROP POLICY IF EXISTS "Users can update their own business profile" ON public.business_profiles;
CREATE POLICY "Users can update their own business profile" ON public.business_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'biznis'));

DROP POLICY IF EXISTS "Users can create their own debts" ON public.business_debts;
CREATE POLICY "Users can create their own debts" ON public.business_debts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'biznis'));

DROP POLICY IF EXISTS "Users can update their own debts" ON public.business_debts;
CREATE POLICY "Users can update their own debts" ON public.business_debts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'biznis'));

-- FOR ALL policyje razbijene na SELECT/INSERT/UPDATE/DELETE (SELECT ostaje otvoren)
DO $$
DECLARE
  tbl text;
  old_policy text;
BEGIN
  FOR tbl, old_policy IN
    SELECT * FROM (VALUES
      ('business_premises', 'Users can manage own premises'),
      ('cash_registers',    'Users can manage own cash registers'),
      ('clients',           'Users can manage own clients'),
      ('invoices',          'Users can manage own invoices'),
      ('inventory_items',   'Users can manage own inventory')
    ) v(tbl, old_policy)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_policy, tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)',
                   tbl || '_select_own', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), ''biznis''))',
                   tbl || '_insert_own', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), ''biznis''))',
                   tbl || '_update_own', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)',
                   tbl || '_delete_own', tbl);
  END LOOP;
END $$;

-- invoice_items — kroz invoice ownera
DROP POLICY IF EXISTS "Users can manage invoice items" ON public.invoice_items;
CREATE POLICY "invoice_items_select_own" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()));
CREATE POLICY "invoice_items_insert_own" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid())
    AND public.can_write_module(auth.uid(), 'biznis')
  );
CREATE POLICY "invoice_items_update_own" ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid())
    AND public.can_write_module(auth.uid(), 'biznis')
  );
CREATE POLICY "invoice_items_delete_own" ON public.invoice_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()));

-- =============================================================
-- SMJER
-- =============================================================
DROP POLICY IF EXISTS "Users can create their own custom categories" ON public.custom_categories;
CREATE POLICY "Users can create their own custom categories" ON public.custom_categories
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Users can update their own custom categories" ON public.custom_categories;
CREATE POLICY "Users can update their own custom categories" ON public.custom_categories
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Users can create own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users can create own recurring transactions" ON public.recurring_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Users can update own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users can update own recurring transactions" ON public.recurring_transactions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Users can create their own savings goals" ON public.savings_goals;
CREATE POLICY "Users can create their own savings goals" ON public.savings_goals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Owners can create savings goals" ON public.savings_goals;
CREATE POLICY "Owners can create savings goals" ON public.savings_goals
  FOR INSERT TO authenticated
  WITH CHECK (
    is_budget_owner(budget_id, auth.uid())
    AND auth.uid() = user_id
    AND public.can_write_module(auth.uid(), 'smjer')
  );

DROP POLICY IF EXISTS "Users can update their own savings goals" ON public.savings_goals;
CREATE POLICY "Users can update their own savings goals" ON public.savings_goals
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Owners can update savings goals" ON public.savings_goals;
CREATE POLICY "Owners can update savings goals" ON public.savings_goals
  FOR UPDATE TO authenticated
  USING (is_budget_owner(budget_id, auth.uid()))
  WITH CHECK (
    is_budget_owner(budget_id, auth.uid())
    AND public.can_write_module(auth.uid(), 'smjer')
  );

DROP POLICY IF EXISTS "Users can create their own installment plans" ON public.installment_plans;
CREATE POLICY "Users can create their own installment plans" ON public.installment_plans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Users can update their own installment plans" ON public.installment_plans;
CREATE POLICY "Users can update their own installment plans" ON public.installment_plans
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Users can create their own installments" ON public.installments;
CREATE POLICY "Users can create their own installments" ON public.installments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

DROP POLICY IF EXISTS "Users can update their own installments" ON public.installments;
CREATE POLICY "Users can update their own installments" ON public.installments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_module(auth.uid(), 'smjer'));

-- =============================================================
-- ROLLBACK (za manualno pokretanje ako treba vratiti stanje):
-- =============================================================
-- BEGIN;
-- -- KRUG
-- DROP POLICY IF EXISTS "krug_insert_authenticated" ON public.krug;
-- CREATE POLICY "krug_insert_authenticated" ON public.krug FOR INSERT
--   WITH CHECK ((auth.uid() IS NOT NULL) AND (created_by = auth.uid()));
-- DROP POLICY IF EXISTS "krug_update_owner" ON public.krug;
-- CREATE POLICY "krug_update_owner" ON public.krug FOR UPDATE
--   USING (krug_is_owner(id, auth.uid())) WITH CHECK (krug_is_owner(id, auth.uid()));
-- DROP POLICY IF EXISTS "krug_membership_insert_owner" ON public.krug_membership;
-- CREATE POLICY "krug_membership_insert_owner" ON public.krug_membership FOR INSERT
--   WITH CHECK (krug_is_owner(krug_id, auth.uid()));
-- DROP POLICY IF EXISTS "krug_membership_update_owner" ON public.krug_membership;
-- CREATE POLICY "krug_membership_update_owner" ON public.krug_membership FOR UPDATE
--   USING (krug_is_owner(krug_id, auth.uid())) WITH CHECK (krug_is_owner(krug_id, auth.uid()));
-- -- PROJEKTI
-- DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
-- CREATE POLICY "Users can create their own projects" ON public.projects FOR INSERT
--   WITH CHECK (auth.uid() = user_id);
-- DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
-- CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE
--   USING (auth.uid() = user_id);
-- DROP POLICY IF EXISTS "Project owners can insert members" ON public.project_members;
-- CREATE POLICY "Project owners can insert members" ON public.project_members FOR INSERT
--   WITH CHECK (is_project_owner(project_id, auth.uid()));
-- DROP POLICY IF EXISTS "Project owners can update members" ON public.project_members;
-- CREATE POLICY "Project owners can update members" ON public.project_members FOR UPDATE
--   USING (is_project_owner(project_id, auth.uid())) WITH CHECK (is_project_owner(project_id, auth.uid()));
-- DROP POLICY IF EXISTS "Project owners can add workers" ON public.project_workers;
-- CREATE POLICY "Project owners can add workers" ON public.project_workers FOR INSERT
--   WITH CHECK (is_project_owner(project_id, auth.uid()));
-- DROP POLICY IF EXISTS "Project owners can update workers" ON public.project_workers;
-- CREATE POLICY "Project owners can update workers" ON public.project_workers FOR UPDATE
--   USING (is_project_owner(project_id, auth.uid())) WITH CHECK (is_project_owner(project_id, auth.uid()));
-- DROP POLICY IF EXISTS "Project owners can create collaborators" ON public.project_collaborators;
-- CREATE POLICY "Project owners can create collaborators" ON public.project_collaborators FOR INSERT
--   WITH CHECK (is_project_owner(project_id, auth.uid()));
-- DROP POLICY IF EXISTS "Project owners can update collaborators" ON public.project_collaborators;
-- CREATE POLICY "Project owners can update collaborators" ON public.project_collaborators FOR UPDATE
--   USING (is_project_owner(project_id, auth.uid())) WITH CHECK (is_project_owner(project_id, auth.uid()));
-- DROP POLICY IF EXISTS "Project owners can create milestones" ON public.project_milestones;
-- CREATE POLICY "Project owners can create milestones" ON public.project_milestones FOR INSERT
--   WITH CHECK (is_project_owner(project_id, auth.uid()));
-- DROP POLICY IF EXISTS "Project owners can update milestones" ON public.project_milestones;
-- CREATE POLICY "Project owners can update milestones" ON public.project_milestones FOR UPDATE
--   USING (is_project_owner(project_id, auth.uid())) WITH CHECK (is_project_owner(project_id, auth.uid()));
-- -- BIZNIS
-- DROP POLICY IF EXISTS "Users can create their own business profile" ON public.business_profiles;
-- CREATE POLICY "Users can create their own business profile" ON public.business_profiles FOR INSERT
--   WITH CHECK (auth.uid() = user_id);
-- DROP POLICY IF EXISTS "Users can update their own business profile" ON public.business_profiles;
-- CREATE POLICY "Users can update their own business profile" ON public.business_profiles FOR UPDATE
--   USING (auth.uid() = user_id);
-- DROP POLICY IF EXISTS "Users can create their own debts" ON public.business_debts;
-- CREATE POLICY "Users can create their own debts" ON public.business_debts FOR INSERT
--   WITH CHECK (auth.uid() = user_id);
-- DROP POLICY IF EXISTS "Users can update their own debts" ON public.business_debts;
-- CREATE POLICY "Users can update their own debts" ON public.business_debts FOR UPDATE
--   USING (auth.uid() = user_id);
-- DO $$
-- DECLARE tbl text;
-- BEGIN
--   FOR tbl IN SELECT unnest(ARRAY['business_premises','cash_registers','clients','invoices','inventory_items']) LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_own', tbl);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_own', tbl);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_own', tbl);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_own', tbl);
--   END LOOP;
-- END $$;
-- CREATE POLICY "Users can manage own premises" ON public.business_premises FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
-- CREATE POLICY "Users can manage own cash registers" ON public.cash_registers FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
-- CREATE POLICY "Users can manage own clients" ON public.clients FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
-- CREATE POLICY "Users can manage own invoices" ON public.invoices FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
-- CREATE POLICY "Users can manage own inventory" ON public.inventory_items FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
-- DROP POLICY IF EXISTS invoice_items_select_own ON public.invoice_items;
-- DROP POLICY IF EXISTS invoice_items_insert_own ON public.invoice_items;
-- DROP POLICY IF EXISTS invoice_items_update_own ON public.invoice_items;
-- DROP POLICY IF EXISTS invoice_items_delete_own ON public.invoice_items;
-- CREATE POLICY "Users can manage invoice items" ON public.invoice_items FOR ALL
--   USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id=invoice_id AND i.user_id=auth.uid()))
--   WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id=invoice_id AND i.user_id=auth.uid()));
-- -- SMJER
-- DROP POLICY IF EXISTS "Users can create their own custom categories" ON public.custom_categories;
-- CREATE POLICY "Users can create their own custom categories" ON public.custom_categories FOR INSERT WITH CHECK (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can update their own custom categories" ON public.custom_categories;
-- CREATE POLICY "Users can update their own custom categories" ON public.custom_categories FOR UPDATE USING (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can create own recurring transactions" ON public.recurring_transactions;
-- CREATE POLICY "Users can create own recurring transactions" ON public.recurring_transactions FOR INSERT WITH CHECK (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can update own recurring transactions" ON public.recurring_transactions;
-- CREATE POLICY "Users can update own recurring transactions" ON public.recurring_transactions FOR UPDATE USING (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can create their own savings goals" ON public.savings_goals;
-- CREATE POLICY "Users can create their own savings goals" ON public.savings_goals FOR INSERT WITH CHECK (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Owners can create savings goals" ON public.savings_goals;
-- CREATE POLICY "Owners can create savings goals" ON public.savings_goals FOR INSERT WITH CHECK (is_budget_owner(budget_id, auth.uid()) AND auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can update their own savings goals" ON public.savings_goals;
-- CREATE POLICY "Users can update their own savings goals" ON public.savings_goals FOR UPDATE USING (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Owners can update savings goals" ON public.savings_goals;
-- CREATE POLICY "Owners can update savings goals" ON public.savings_goals FOR UPDATE USING (is_budget_owner(budget_id, auth.uid()));
-- DROP POLICY IF EXISTS "Users can create their own installment plans" ON public.installment_plans;
-- CREATE POLICY "Users can create their own installment plans" ON public.installment_plans FOR INSERT WITH CHECK (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can update their own installment plans" ON public.installment_plans;
-- CREATE POLICY "Users can update their own installment plans" ON public.installment_plans FOR UPDATE USING (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can create their own installments" ON public.installments;
-- CREATE POLICY "Users can create their own installments" ON public.installments FOR INSERT WITH CHECK (auth.uid()=user_id);
-- DROP POLICY IF EXISTS "Users can update their own installments" ON public.installments;
-- CREATE POLICY "Users can update their own installments" ON public.installments FOR UPDATE USING (auth.uid()=user_id);
-- -- Helper (opcionalno)
-- DROP FUNCTION IF EXISTS public.can_write_module(uuid, text);
-- COMMIT;