
-- 1) Helper: write permission on a payment source (owner / full / limited, but NOT viewer)
CREATE OR REPLACE FUNCTION public.can_write_payment_source(_source_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.custom_payment_sources
    WHERE id = _source_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.payment_source_members
    WHERE payment_source_id = _source_id
      AND user_id = _user_id
      AND role IN ('full','limited','member')
  );
$$;

-- 2) Helper: effective role string ('owner' | 'full' | 'limited' | 'viewer' | null)
CREATE OR REPLACE FUNCTION public.payment_source_role(_source_id uuid, _user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.custom_payment_sources WHERE id = _source_id AND user_id = _user_id) THEN 'owner'
    ELSE (SELECT role FROM public.payment_source_members WHERE payment_source_id = _source_id AND user_id = _user_id LIMIT 1)
  END;
$$;

-- 3) Triggers map family role -> ps role (viewer stays viewer, everything else becomes limited)
CREATE OR REPLACE FUNCTION public.fm_grant_limited_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payment_source_members (payment_source_id, user_id, role)
  SELECT fss.payment_source_id, NEW.user_id,
         CASE WHEN NEW.role = 'viewer' THEN 'viewer' ELSE 'limited' END
  FROM public.family_shared_sources fss
  JOIN public.custom_payment_sources cps ON cps.id = fss.payment_source_id
  WHERE fss.group_id = NEW.group_id
    AND cps.user_id <> NEW.user_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fss_grant_limited_on_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.custom_payment_sources WHERE id = NEW.payment_source_id;

  INSERT INTO public.payment_source_members (payment_source_id, user_id, role)
  SELECT NEW.payment_source_id, fm.user_id,
         CASE WHEN fm.role = 'viewer' THEN 'viewer' ELSE 'limited' END
  FROM public.family_members fm
  WHERE fm.group_id = NEW.group_id
    AND fm.user_id <> COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 4) Sync ps role when family role changes (UPDATE on family_members)
CREATE OR REPLACE FUNCTION public.fm_sync_role_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE public.payment_source_members psm
       SET role = CASE WHEN NEW.role = 'viewer' THEN 'viewer' ELSE 'limited' END
     WHERE psm.user_id = NEW.user_id
       AND psm.role IN ('limited','viewer')
       AND psm.payment_source_id IN (
         SELECT payment_source_id FROM public.family_shared_sources WHERE group_id = NEW.group_id
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fm_sync_role_on_update_trigger ON public.family_members;
CREATE TRIGGER fm_sync_role_on_update_trigger
AFTER UPDATE OF role ON public.family_members
FOR EACH ROW EXECUTE FUNCTION public.fm_sync_role_on_update();

-- 5) RLS: replace SELECT policy so any member sees ALL transactions on shared source
DROP POLICY IF EXISTS "Members can view expenses on shared payment sources" ON public.expenses;
CREATE POLICY "Members can view expenses on shared payment sources"
ON public.expenses
FOR SELECT
USING (
  payment_source IS NOT NULL AND
  CASE
    WHEN payment_source LIKE 'custom:%' AND replace(payment_source, 'custom:', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.is_payment_source_member((replace(payment_source, 'custom:', ''))::uuid, auth.uid())
    WHEN payment_source ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.is_payment_source_member((payment_source)::uuid, auth.uid())
    ELSE false
  END
);

-- 6) RLS: replace INSERT policy so viewer cannot insert on shared source
DROP POLICY IF EXISTS "Members can create expenses on shared payment sources" ON public.expenses;
CREATE POLICY "Members can create expenses on shared payment sources"
ON public.expenses
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND payment_source IS NOT NULL
  AND CASE
    WHEN payment_source LIKE 'custom:%' AND replace(payment_source, 'custom:', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_write_payment_source((replace(payment_source, 'custom:', ''))::uuid, auth.uid())
    WHEN payment_source ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_write_payment_source((payment_source)::uuid, auth.uid())
    ELSE false
  END
);

-- 7) Grants
GRANT EXECUTE ON FUNCTION public.can_write_payment_source(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_source_role(uuid, uuid) TO authenticated;
