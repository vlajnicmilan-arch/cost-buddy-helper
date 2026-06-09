
CREATE OR REPLACE FUNCTION public.get_project_member_profiles(_project_id uuid)
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, COALESCE(NULLIF(TRIM(p.display_name), ''), NULL) AS display_name
  FROM public.profiles p
  WHERE p.user_id IN (
    -- Owner
    SELECT pr.user_id FROM public.projects pr WHERE pr.id = _project_id
    UNION
    -- Persisted members
    SELECT pm.user_id FROM public.project_members pm WHERE pm.project_id = _project_id
  )
  AND EXISTS (
    -- Caller must be owner or member of this project
    SELECT 1 FROM public.projects pr2
    WHERE pr2.id = _project_id AND pr2.user_id = auth.uid()
    UNION
    SELECT 1 FROM public.project_members pm2
    WHERE pm2.project_id = _project_id AND pm2.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.get_project_member_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_member_profiles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_member_profiles(uuid) TO service_role;
