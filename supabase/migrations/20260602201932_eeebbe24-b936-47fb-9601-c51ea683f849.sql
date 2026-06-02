-- Batch helper za filter participant push primatelja.
-- Vraća subset zadanih user-id-a koji su Projects subscriberi (admin/pro/business/lifetime).
-- Owner se NE provjerava ovdje — caller (edge function) ga eksplicitno dodaje u instant push listu.
CREATE OR REPLACE FUNCTION public.filter_projects_subscribers(p_user_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT uid), ARRAY[]::uuid[])
  FROM unnest(p_user_ids) AS uid
  WHERE public.is_projects_subscriber(uid);
$$;

REVOKE EXECUTE ON FUNCTION public.filter_projects_subscribers(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_projects_subscribers(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.filter_projects_subscribers(uuid[]) IS
  'Returns subset of user ids who are Projects subscribers. Used by notify-project-* edge functions to suppress instant push for Core participants (non-subscribers); those users only receive the daily participant digest.';
