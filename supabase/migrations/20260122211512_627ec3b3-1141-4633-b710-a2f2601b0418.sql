-- Allow users to view profiles of members in shared income sources
CREATE POLICY "Users can view profiles of shared income source members"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.income_source_members ism1
    JOIN public.income_source_members ism2 ON ism1.income_source_id = ism2.income_source_id
    WHERE ism1.user_id = auth.uid()
    AND ism2.user_id = profiles.user_id
  )
);