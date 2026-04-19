-- Add per-member context to project memberships and invitations
-- Allows project owner to suggest where the project appears for the invitee
-- (Personal Finance vs a specific Business Profile of the invitee).

-- 1) project_members: store the actual final context for this member
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS member_context text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS member_business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL;

-- valid values: 'personal' | 'business'
ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_context_check;
ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_context_check
    CHECK (member_context IN ('personal','business'));

-- 2) project_invitations: store the suggested context from the inviter
ALTER TABLE public.project_invitations
  ADD COLUMN IF NOT EXISTS suggested_context text NOT NULL DEFAULT 'personal';

ALTER TABLE public.project_invitations
  DROP CONSTRAINT IF EXISTS project_invitations_suggested_context_check;
ALTER TABLE public.project_invitations
  ADD CONSTRAINT project_invitations_suggested_context_check
    CHECK (suggested_context IN ('personal','business'));

-- Index for context filtering
CREATE INDEX IF NOT EXISTS idx_project_members_user_context
  ON public.project_members(user_id, member_context, member_business_profile_id);
