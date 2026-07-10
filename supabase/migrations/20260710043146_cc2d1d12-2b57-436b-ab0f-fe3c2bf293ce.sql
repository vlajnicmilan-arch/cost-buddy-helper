-- Defense-in-depth: remove anon EXECUTE on sensitive callable Krug RPCs and one SECURITY DEFINER trigger-only helper.
-- Authenticated role retains EXECUTE. Triggers fire regardless of grants.

REVOKE EXECUTE ON FUNCTION public.krug_cancel_deletion(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.krug_vote_deletion(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.krug_bootstrap_creator() FROM anon;
REVOKE EXECUTE ON FUNCTION public.krug_bootstrap_creator() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.krug_cancel_deletion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.krug_vote_deletion(uuid, boolean) FROM PUBLIC;