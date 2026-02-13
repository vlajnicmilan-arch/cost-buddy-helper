
-- Payment source members table
CREATE TABLE public.payment_source_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_source_id uuid NOT NULL REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Payment source invitations table
CREATE TABLE public.payment_source_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_source_id uuid NOT NULL REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Helper function to check payment source membership
CREATE OR REPLACE FUNCTION public.is_payment_source_member(_source_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM payment_source_members
    WHERE payment_source_id = _source_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM custom_payment_sources
    WHERE id = _source_id AND user_id = _user_id
  );
$$;

-- Helper function to check payment source ownership
CREATE OR REPLACE FUNCTION public.is_payment_source_owner(_source_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM custom_payment_sources
    WHERE id = _source_id AND user_id = _user_id
  );
$$;

-- RLS on payment_source_members
ALTER TABLE public.payment_source_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view payment source memberships"
  ON public.payment_source_members FOR SELECT
  TO authenticated
  USING (is_payment_source_member(payment_source_id, auth.uid()));

CREATE POLICY "Owners can add ps members"
  ON public.payment_source_members FOR INSERT
  TO authenticated
  WITH CHECK (is_payment_source_owner(payment_source_id, auth.uid()));

CREATE POLICY "Owners can remove ps members"
  ON public.payment_source_members FOR DELETE
  TO authenticated
  USING (is_payment_source_owner(payment_source_id, auth.uid()));

CREATE POLICY "Owners can update ps members"
  ON public.payment_source_members FOR UPDATE
  TO authenticated
  USING (is_payment_source_owner(payment_source_id, auth.uid()));

-- RLS on payment_source_invitations
ALTER TABLE public.payment_source_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can create ps invitations"
  ON public.payment_source_invitations FOR INSERT
  TO authenticated
  WITH CHECK (is_payment_source_owner(payment_source_id, auth.uid()));

CREATE POLICY "Owners can view ps invitations"
  ON public.payment_source_invitations FOR SELECT
  TO authenticated
  USING (is_payment_source_owner(payment_source_id, auth.uid()));

CREATE POLICY "Owners can update ps invitations"
  ON public.payment_source_invitations FOR UPDATE
  TO authenticated
  USING (is_payment_source_owner(payment_source_id, auth.uid()));

CREATE POLICY "Owners can delete ps invitations"
  ON public.payment_source_invitations FOR DELETE
  TO authenticated
  USING (is_payment_source_owner(payment_source_id, auth.uid()));

-- Allow members to view shared payment sources
CREATE POLICY "Members can view shared payment sources"
  ON public.custom_payment_sources FOR SELECT
  TO authenticated
  USING (is_payment_source_member(id, auth.uid()));

-- Allow members to view shared payment source cards
CREATE POLICY "Members can view shared payment source cards"
  ON public.payment_source_cards FOR SELECT
  TO authenticated
  USING (is_payment_source_member(payment_source_id, auth.uid()));

-- Allow members to create expenses on shared payment sources
CREATE POLICY "Members can create expenses on shared payment sources"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = user_id) AND
    (payment_source IS NOT NULL) AND
    (is_payment_source_member(payment_source::uuid, auth.uid()))
  );

-- Update consume_invitation_token to handle payment_source type
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
  ELSE
    RAISE EXCEPTION 'Unknown invitation type: %', _invitation_type;
  END IF;
END;
$$;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_source_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_source_invitations;
