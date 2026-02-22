
-- Create family_shared_savings table
CREATE TABLE public.family_shared_savings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  savings_goal_id UUID NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  added_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, savings_goal_id)
);

-- Enable RLS
ALTER TABLE public.family_shared_savings ENABLE ROW LEVEL SECURITY;

-- Members can view shared savings
CREATE POLICY "Members can view shared savings"
  ON public.family_shared_savings FOR SELECT
  USING (is_family_member(group_id, auth.uid()));

-- Owners can add shared savings
CREATE POLICY "Owners can manage shared savings"
  ON public.family_shared_savings FOR INSERT
  WITH CHECK (is_family_owner(group_id, auth.uid()));

-- Owners can remove shared savings
CREATE POLICY "Owners can remove shared savings"
  ON public.family_shared_savings FOR DELETE
  USING (is_family_owner(group_id, auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_shared_savings;
