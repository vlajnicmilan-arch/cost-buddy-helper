GRANT EXECUTE ON FUNCTION public.get_project_role(uuid, uuid) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.is_project_participant_active(uuid, uuid) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.is_projects_subscriber(uuid) TO supabase_read_only_user;