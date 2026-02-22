
-- Create family activity log table
CREATE TABLE public.family_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- 'added_source', 'removed_source', 'added_budget', 'removed_budget', 'added_project', 'removed_project', 'invited_member', 'member_joined', 'member_left', 'expense_added', 'expense_deleted'
  action_description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.family_activity_log ENABLE ROW LEVEL SECURITY;

-- Members can view activity for their groups
CREATE POLICY "Members can view group activity"
ON public.family_activity_log
FOR SELECT
TO authenticated
USING (is_family_member(group_id, auth.uid()));

-- Members can insert activity (logged automatically)
CREATE POLICY "Members can log activity"
ON public.family_activity_log
FOR INSERT
TO authenticated
WITH CHECK (is_family_member(group_id, auth.uid()) AND auth.uid() = user_id);

-- Only owners can delete activity logs
CREATE POLICY "Owners can delete activity"
ON public.family_activity_log
FOR DELETE
TO authenticated
USING (is_family_owner(group_id, auth.uid()));

-- Add index for efficient querying
CREATE INDEX idx_family_activity_group_created ON public.family_activity_log (group_id, created_at DESC);
