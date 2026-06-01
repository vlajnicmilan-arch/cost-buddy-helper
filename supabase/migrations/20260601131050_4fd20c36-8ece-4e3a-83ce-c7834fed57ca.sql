-- Family relationship tags + default split rule per relationship
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS relationship text
  CHECK (relationship IS NULL OR relationship IN (
    'partner','child','parent','sibling','roommate','grandparent','other'
  ));

CREATE INDEX IF NOT EXISTS idx_family_members_relationship
  ON public.family_members (group_id, relationship);

COMMENT ON COLUMN public.family_members.relationship IS
  'Optional relationship tag used by the UI to suggest defaults (e.g. child = excluded, partner = proportional).';
