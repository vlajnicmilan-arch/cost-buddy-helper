DROP FUNCTION IF EXISTS public.list_public_relations();

CREATE FUNCTION public.list_public_relations()
RETURNS TABLE (relname text, relkind text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.relname::text, c.relkind::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
$$;

REVOKE ALL ON FUNCTION public.list_public_relations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_relations() TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_relations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_relations() TO service_role;