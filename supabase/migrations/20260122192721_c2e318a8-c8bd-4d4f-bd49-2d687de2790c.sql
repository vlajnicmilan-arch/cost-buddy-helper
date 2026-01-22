-- Allow members to view income sources they belong to
CREATE POLICY "Members can view shared income sources"
ON public.income_sources
FOR SELECT
USING (is_income_source_member(id, auth.uid()));