-- Krug Execute Revoke Patch: close callable helpers / emit / purge from anon+authenticated.
-- These functions are SECURITY DEFINER and are invoked either from other SECURITY DEFINER
-- Krug RPCs (which run as the function owner and therefore retain EXECUTE regardless of
-- caller-role grants) or from the service_role (cron / edge fn). Revoking EXECUTE from
-- anon+authenticated does not break any production flow.

REVOKE EXECUTE ON FUNCTION public.krug_notify_all_members(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.krug_notify_full_members(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.krug_purge_deleted(integer)    FROM PUBLIC, anon, authenticated;

-- Optional hygiene: trigger-only helpers. Triggers fire regardless of EXECUTE grants,
-- and nothing calls these directly, so we strip the default PUBLIC/authenticated grants.
REVOKE EXECUTE ON FUNCTION public.krug_bootstrap_creator()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.krug_enforce_punopravni_cap()  FROM PUBLIC, anon, authenticated;
