-- Create trigger function to add project owner as manager member
CREATE OR REPLACE FUNCTION public.add_project_owner_as_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role, display_name)
  SELECT NEW.id, NEW.user_id, 'manager', p.display_name
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger on projects table
DROP TRIGGER IF EXISTS on_project_created ON public.projects;
CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.add_project_owner_as_member();

-- Also add existing project owners as members (backfill)
INSERT INTO public.project_members (project_id, user_id, role, display_name)
SELECT p.id, p.user_id, 'manager', pr.display_name
FROM public.projects p
LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_members pm 
  WHERE pm.project_id = p.id AND pm.user_id = p.user_id
);