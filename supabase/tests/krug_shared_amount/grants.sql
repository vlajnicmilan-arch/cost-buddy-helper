REVOKE ALL ON FUNCTION public.krug_override_propose(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.krug_override_propose(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.krug_settlement_preview(uuid, date, date, text, jsonb) TO authenticated, service_role;
