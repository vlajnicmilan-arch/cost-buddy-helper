-- Enum za uloge u krugu prihoda
CREATE TYPE public.income_source_role AS ENUM ('owner', 'member');

-- Enum za status transakcije (za odobrenje)
CREATE TYPE public.transaction_status AS ENUM ('pending', 'approved', 'rejected');

-- Tablica za članstvo u izvoru prihoda
CREATE TABLE public.income_source_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_source_id UUID NOT NULL REFERENCES public.income_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role income_source_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(income_source_id, user_id)
);

-- Tablica za pozivnice
CREATE TABLE public.income_source_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_source_id UUID NOT NULL REFERENCES public.income_sources(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(income_source_id, email)
);

-- Dodaj status kolonu u expenses tablicu za odobrenje transakcija
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS status transaction_status DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id);

-- Enable RLS
ALTER TABLE public.income_source_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_source_invitations ENABLE ROW LEVEL SECURITY;

-- RLS policies za income_source_members
-- Korisnici mogu vidjeti članstva u izvorima kojih su dio
CREATE POLICY "Users can view memberships of sources they belong to"
ON public.income_source_members FOR SELECT
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.income_source_members ism
    WHERE ism.income_source_id = income_source_members.income_source_id
    AND ism.user_id = auth.uid()
  )
);

-- Vlasnici mogu dodavati članove
CREATE POLICY "Owners can add members"
ON public.income_source_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.income_source_members ism
    WHERE ism.income_source_id = income_source_members.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  ) OR 
  -- Ili ako je prvi član (vlasnik koji dodaje sebe)
  EXISTS (
    SELECT 1 FROM public.income_sources
    WHERE id = income_source_members.income_source_id
    AND user_id = auth.uid()
  )
);

-- Vlasnici mogu micati članove
CREATE POLICY "Owners can remove members"
ON public.income_source_members FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.income_source_members ism
    WHERE ism.income_source_id = income_source_members.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  )
);

-- RLS policies za income_source_invitations
CREATE POLICY "Users can view invitations they sent or for sources they own"
ON public.income_source_invitations FOR SELECT
USING (
  invited_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  )
);

CREATE POLICY "Owners can create invitations"
ON public.income_source_invitations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  ) OR
  EXISTS (
    SELECT 1 FROM public.income_sources
    WHERE id = income_source_invitations.income_source_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete invitations"
ON public.income_source_invitations FOR DELETE
USING (
  invited_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.income_source_members ism
    WHERE ism.income_source_id = income_source_invitations.income_source_id
    AND ism.user_id = auth.uid()
    AND ism.role = 'owner'
  )
);

-- Update RLS za expenses - članovi mogu vidjeti transakcije izvora
CREATE POLICY "Members can view source transactions"
ON public.expenses FOR SELECT
USING (
  auth.uid() = user_id OR
  (
    income_source_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.income_source_members ism
      WHERE ism.income_source_id = expenses.income_source_id
      AND ism.user_id = auth.uid()
    )
  )
);

-- Članovi mogu dodavati transakcije (ali status je pending)
CREATE POLICY "Members can add transactions to shared sources"
ON public.expenses FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR
  (
    income_source_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.income_source_members ism
      WHERE ism.income_source_id = expenses.income_source_id
      AND ism.user_id = auth.uid()
    )
  )
);

-- Funkcija za provjeru vlasništva izvora
CREATE OR REPLACE FUNCTION public.is_income_source_owner(_user_id UUID, _source_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.income_source_members
    WHERE user_id = _user_id
      AND income_source_id = _source_id
      AND role = 'owner'
  ) OR EXISTS (
    SELECT 1
    FROM public.income_sources
    WHERE id = _source_id
      AND user_id = _user_id
  )
$$;

-- Trigger za automatski dodati vlasnika kao člana kad se kreira izvor
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.income_source_members (income_source_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (income_source_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_income_source_created
AFTER INSERT ON public.income_sources
FOR EACH ROW
EXECUTE FUNCTION public.add_owner_as_member();