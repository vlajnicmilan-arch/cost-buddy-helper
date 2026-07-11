-- 1) Realtime: allow Krug members to receive INSERT/DELETE for shared sources
ALTER PUBLICATION supabase_realtime ADD TABLE public.krug_shared_payment_source;
ALTER TABLE public.krug_shared_payment_source REPLICA IDENTITY FULL;

-- 2) Display-safe resolver — returns ONLY name+currency for sources linked to the Krug,
--    scoped to Krug members. Does NOT widen custom_payment_sources RLS; only exposes
--    the two display fields that are already implied by the link's public existence.
CREATE OR REPLACE FUNCTION public.get_krug_shared_source_display(_krug_id uuid)
RETURNS TABLE (payment_source_id text, name text, currency text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.krug_is_member(_krug_id, auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sps.payment_source_id,
    CASE
      WHEN sps.payment_source_id LIKE 'custom:%' THEN cps.name
      ELSE NULL
    END AS name,
    CASE
      WHEN sps.payment_source_id LIKE 'custom:%' THEN cps.currency
      ELSE NULL
    END AS currency
  FROM public.krug_shared_payment_source sps
  LEFT JOIN public.custom_payment_sources cps
    ON sps.payment_source_id LIKE 'custom:%'
   AND cps.id = NULLIF(substr(sps.payment_source_id, 8), '')::uuid
  WHERE sps.krug_id = _krug_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_krug_shared_source_display(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_krug_shared_source_display(uuid) TO authenticated, service_role;