-- Pozvani NIJE član kruga pa RLS na `krug` ne dopušta čitanje imena.
-- Ova funkcija je jedini prozor: vraća minimum potreban za odluku.
CREATE OR REPLACE FUNCTION public.krug_list_my_invitations()
RETURNS TABLE(
  id uuid,
  krug_id uuid,
  krug_name text,
  krug_preset text,
  role public.krug_membership_role,
  invited_by uuid,
  inviter_name text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id,
         i.krug_id,
         k.name,
         k.preset::text,
         i.role,
         i.invited_by,
         COALESCE(p.display_name, ''),
         i.expires_at,
         i.created_at
    FROM public.krug_invitations i
    JOIN public.krug k ON k.id = i.krug_id
    LEFT JOIN public.profiles p ON p.user_id = i.invited_by
   WHERE i.invited_user_id = auth.uid()
     AND i.status = 'pending'
     AND i.expires_at > now()
     AND k.deleted_at IS NULL
   ORDER BY i.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_list_my_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_list_my_invitations() TO authenticated;