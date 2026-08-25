REVOKE EXECUTE ON FUNCTION public.mail_item_discard(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mail_item_restore(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mail_reject_muted(uuid, text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mail_reject_muted(uuid, text, text, boolean, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mail_item_discard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_item_restore(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_reject_muted(uuid, text, text, boolean, text) TO service_role;