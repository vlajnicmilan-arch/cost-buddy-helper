-- Helper: dijele li dva korisnika ijedan Krug (owner ili member).
-- SECURITY DEFINER da zaobiđe RLS na krug_membership/krug_ownership i spriječi rekurziju.
CREATE OR REPLACE FUNCTION public.krug_shares_krug_with(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _viewer IS NULL OR _target IS NULL THEN false
    WHEN _viewer = _target THEN true
    ELSE EXISTS (
      -- oba članovi istog kruga (bilo koja role)
      SELECT 1
      FROM public.krug_membership m1
      JOIN public.krug_membership m2 ON m2.krug_id = m1.krug_id
      WHERE m1.user_id = _viewer AND m2.user_id = _target
      UNION ALL
      -- viewer owner, target član
      SELECT 1
      FROM public.krug_ownership o
      JOIN public.krug_membership m ON m.krug_id = o.krug_id
      WHERE o.user_id = _viewer AND m.user_id = _target
      UNION ALL
      -- viewer član, target owner
      SELECT 1
      FROM public.krug_membership m
      JOIN public.krug_ownership o ON o.krug_id = m.krug_id
      WHERE m.user_id = _viewer AND o.user_id = _target
      UNION ALL
      -- oba ownera istog kruga (edge, ali defenzivno)
      SELECT 1
      FROM public.krug_ownership o1
      JOIN public.krug_ownership o2 ON o2.krug_id = o1.krug_id
      WHERE o1.user_id = _viewer AND o2.user_id = _target
    )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_shares_krug_with(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_shares_krug_with(uuid, uuid) TO authenticated, service_role;

-- SELECT policy: vidljivost profila članova istog Kruga.
-- Aplikacija SELECTa samo (user_id, display_name); PII kolone ostaju neizložene
-- jer nijedna druga SELECT policy ih ne otvara. Postojeća self-policy ostaje.
DROP POLICY IF EXISTS "Krug co-members can view display name" ON public.profiles;

CREATE POLICY "Krug co-members can view display name"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.krug_shares_krug_with(auth.uid(), user_id));