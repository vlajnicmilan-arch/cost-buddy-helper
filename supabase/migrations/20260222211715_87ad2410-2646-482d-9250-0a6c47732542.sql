
-- Create family groups table
CREATE TABLE public.family_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '👨‍👩‍👧‍👦',
  color text DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;

-- Create family members table
CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Create family invitations table
CREATE TABLE public.family_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by uuid NOT NULL,
  invited_user_id uuid,
  role text NOT NULL DEFAULT 'member',
  email text NOT NULL DEFAULT 'link-invite',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- Explicit linking: which payment sources belong to a family group
CREATE TABLE public.family_shared_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  payment_source_id uuid NOT NULL REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, payment_source_id)
);

ALTER TABLE public.family_shared_sources ENABLE ROW LEVEL SECURITY;

-- Explicit linking: which budgets belong to a family group
CREATE TABLE public.family_shared_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES public.budget_plans(id) ON DELETE CASCADE,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, budget_id)
);

ALTER TABLE public.family_shared_budgets ENABLE ROW LEVEL SECURITY;

-- Security definer function to check family membership
CREATE OR REPLACE FUNCTION public.is_family_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE group_id = _group_id AND user_id = _user_id
  )
$$;

-- Security definer function to check family ownership
CREATE OR REPLACE FUNCTION public.is_family_owner(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE group_id = _group_id AND user_id = _user_id AND role = 'owner'
  )
$$;

-- Trigger to add creator as owner member
CREATE OR REPLACE FUNCTION public.add_family_owner_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.family_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER add_family_owner_member
AFTER INSERT ON public.family_groups
FOR EACH ROW
EXECUTE FUNCTION public.add_family_owner_as_member();

-- Updated_at trigger
CREATE TRIGGER update_family_groups_updated_at
BEFORE UPDATE ON public.family_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: family_groups
CREATE POLICY "Members can view their groups" ON public.family_groups
FOR SELECT TO authenticated USING (is_family_member(id, auth.uid()));

CREATE POLICY "Users can create groups" ON public.family_groups
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update groups" ON public.family_groups
FOR UPDATE TO authenticated USING (is_family_owner(id, auth.uid()));

CREATE POLICY "Owners can delete groups" ON public.family_groups
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS: family_members
CREATE POLICY "Members can view group members" ON public.family_members
FOR SELECT TO authenticated USING (is_family_member(group_id, auth.uid()));

CREATE POLICY "Owners can add members" ON public.family_members
FOR INSERT TO authenticated WITH CHECK (is_family_owner(group_id, auth.uid()));

CREATE POLICY "Owners can update members" ON public.family_members
FOR UPDATE TO authenticated USING (is_family_owner(group_id, auth.uid()));

CREATE POLICY "Owners can remove members" ON public.family_members
FOR DELETE TO authenticated USING (is_family_owner(group_id, auth.uid()));

-- RLS: family_invitations
CREATE POLICY "Owners can manage invitations" ON public.family_invitations
FOR ALL TO authenticated USING (is_family_owner(group_id, auth.uid()));

CREATE POLICY "Invited users can view their invitations" ON public.family_invitations
FOR SELECT TO authenticated USING (invited_user_id = auth.uid());

-- RLS: family_shared_sources
CREATE POLICY "Members can view shared sources" ON public.family_shared_sources
FOR SELECT TO authenticated USING (is_family_member(group_id, auth.uid()));

CREATE POLICY "Owners can manage shared sources" ON public.family_shared_sources
FOR INSERT TO authenticated WITH CHECK (is_family_owner(group_id, auth.uid()));

CREATE POLICY "Owners can remove shared sources" ON public.family_shared_sources
FOR DELETE TO authenticated USING (is_family_owner(group_id, auth.uid()));

-- RLS: family_shared_budgets
CREATE POLICY "Members can view shared budgets" ON public.family_shared_budgets
FOR SELECT TO authenticated USING (is_family_member(group_id, auth.uid()));

CREATE POLICY "Owners can manage shared budgets" ON public.family_shared_budgets
FOR INSERT TO authenticated WITH CHECK (is_family_owner(group_id, auth.uid()));

CREATE POLICY "Owners can remove shared budgets" ON public.family_shared_budgets
FOR DELETE TO authenticated USING (is_family_owner(group_id, auth.uid()));

-- Allow family members to see each other's profiles
DROP POLICY IF EXISTS "Users can view profiles of shared members" ON public.profiles;
CREATE POLICY "Users can view profiles of shared members" ON public.profiles
FOR SELECT TO authenticated
USING (
  (EXISTS (
    SELECT 1 FROM income_source_members ism1
    JOIN income_source_members ism2 ON ism1.income_source_id = ism2.income_source_id
    WHERE ism1.user_id = auth.uid() AND ism2.user_id = profiles.user_id
  )) OR
  (EXISTS (
    SELECT 1 FROM project_members pm1
    JOIN project_members pm2 ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = auth.uid() AND pm2.user_id = profiles.user_id
  )) OR
  (EXISTS (
    SELECT 1 FROM budget_members bm1
    JOIN budget_members bm2 ON bm1.budget_id = bm2.budget_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = profiles.user_id
  )) OR
  (EXISTS (
    SELECT 1 FROM family_members fm1
    JOIN family_members fm2 ON fm1.group_id = fm2.group_id
    WHERE fm1.user_id = auth.uid() AND fm2.user_id = profiles.user_id
  ))
);

-- Update consume_invitation_token to support family invitations
CREATE OR REPLACE FUNCTION public.consume_invitation_token(_invitation_type text, _token text)
RETURNS TABLE(invitation_id uuid, invited_by uuid, role text, target_id uuid, target_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _invitation_type = 'project' THEN
    RETURN QUERY
    UPDATE project_invitations pi
    SET status = 'accepted', used_at = now()
    FROM projects p
    WHERE pi.token = _token::uuid
      AND pi.status = 'pending'
      AND pi.expires_at > now()
      AND pi.used_at IS NULL
      AND p.id = pi.project_id
    RETURNING pi.id, pi.invited_by, pi.role, pi.project_id, p.name;
  ELSIF _invitation_type = 'budget' THEN
    RETURN QUERY
    UPDATE budget_invitations bi
    SET status = 'accepted', used_at = now()
    FROM budget_plans bp
    WHERE bi.token = _token::uuid
      AND bi.status = 'pending'
      AND bi.expires_at > now()
      AND bi.used_at IS NULL
      AND bp.id = bi.budget_id
    RETURNING bi.id, bi.invited_by, bi.role, bi.budget_id, bp.name;
  ELSIF _invitation_type = 'payment_source' THEN
    RETURN QUERY
    UPDATE payment_source_invitations psi
    SET status = 'accepted', used_at = now()
    FROM custom_payment_sources cps
    WHERE psi.token = _token::uuid
      AND psi.status = 'pending'
      AND psi.expires_at > now()
      AND psi.used_at IS NULL
      AND cps.id = psi.payment_source_id
    RETURNING psi.id, psi.invited_by, psi.role, psi.payment_source_id, cps.name;
  ELSIF _invitation_type = 'family' THEN
    RETURN QUERY
    UPDATE family_invitations fi
    SET status = 'accepted', used_at = now()
    FROM family_groups fg
    WHERE fi.token = _token::uuid
      AND fi.status = 'pending'
      AND fi.expires_at > now()
      AND fi.used_at IS NULL
      AND fg.id = fi.group_id
    RETURNING fi.id, fi.invited_by, fi.role, fi.group_id, fg.name;
  ELSE
    RAISE EXCEPTION 'Unknown invitation type: %', _invitation_type;
  END IF;
END;
$$;
