
-- Add owner SELECT policy so PostgREST return=representation works
CREATE POLICY "Owners can view their own groups"
ON public.family_groups FOR SELECT TO authenticated
USING (auth.uid() = user_id);
