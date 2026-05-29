DROP POLICY IF EXISTS "Users can view profiles of shared members" ON public.profiles;

CREATE POLICY "Users can view profiles of shared members"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM income_source_members ism1
    JOIN income_source_members ism2 ON ism1.income_source_id = ism2.income_source_id
    WHERE ism1.user_id = auth.uid() AND ism2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM project_members pm1
    JOIN project_members pm2 ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = auth.uid() AND pm2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM budget_members bm1
    JOIN budget_members bm2 ON bm1.budget_id = bm2.budget_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM family_members fm1
    JOIN family_members fm2 ON fm1.group_id = fm2.group_id
    WHERE fm1.user_id = auth.uid() AND fm2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM payment_source_members psm1
    JOIN payment_source_members psm2 ON psm1.payment_source_id = psm2.payment_source_id
    WHERE psm1.user_id = auth.uid() AND psm2.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM custom_payment_sources cps
    JOIN payment_source_members psm ON psm.payment_source_id = cps.id
    WHERE psm.user_id = auth.uid() AND cps.user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1 FROM custom_payment_sources cps2
    JOIN payment_source_members psm2 ON psm2.payment_source_id = cps2.id
    WHERE cps2.user_id = auth.uid() AND psm2.user_id = profiles.user_id
  )
);