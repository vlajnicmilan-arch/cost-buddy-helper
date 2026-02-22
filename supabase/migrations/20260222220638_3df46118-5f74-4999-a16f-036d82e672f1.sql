
-- Create family messages table
CREATE TABLE public.family_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.family_messages ENABLE ROW LEVEL SECURITY;

-- Members can view messages
CREATE POLICY "Members can view group messages"
ON public.family_messages FOR SELECT
TO authenticated
USING (is_family_member(group_id, auth.uid()));

-- Members can send messages
CREATE POLICY "Members can send messages"
ON public.family_messages FOR INSERT
TO authenticated
WITH CHECK (is_family_member(group_id, auth.uid()) AND auth.uid() = user_id);

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages"
ON public.family_messages FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_messages;
