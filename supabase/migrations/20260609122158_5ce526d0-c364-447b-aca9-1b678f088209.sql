WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY token
      ORDER BY COALESCE(last_used_at, created_at) DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.push_tokens
)
DELETE FROM public.push_tokens p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_unique
  ON public.push_tokens (token);

CREATE OR REPLACE FUNCTION public.cleanup_duplicate_push_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  WITH ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY token
        ORDER BY COALESCE(last_used_at, created_at) DESC, created_at DESC, id DESC
      ) AS rn
    FROM public.push_tokens
  )
  DELETE FROM public.push_tokens p
  USING ranked r
  WHERE p.id = r.id
    AND r.rn > 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_duplicate_push_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_duplicate_push_tokens() TO service_role;