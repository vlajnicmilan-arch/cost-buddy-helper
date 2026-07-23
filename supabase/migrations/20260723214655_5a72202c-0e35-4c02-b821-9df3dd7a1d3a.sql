CREATE TABLE IF NOT EXISTS public.company_lookup_cache (
  query_normalized text PRIMARY KEY,
  payload jsonb NOT NULL,
  hit_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.company_lookup_cache TO service_role;

ALTER TABLE public.company_lookup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only_no_client_access"
  ON public.company_lookup_cache
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);