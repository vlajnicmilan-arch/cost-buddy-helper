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
    AND c.relkind IN ('r', 'p', 'v', 'm')
$$;

REVOKE ALL ON FUNCTION public.list_public_relations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_relations() TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_relations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_relations() TO service_role;

CREATE OR REPLACE FUNCTION public.list_public_columns()
RETURNS TABLE (relname text, column_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.relname::text, a.attname::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND a.attnum > 0
    AND NOT a.attisdropped
$$;

REVOKE ALL ON FUNCTION public.list_public_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_columns() TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_columns() TO service_role;