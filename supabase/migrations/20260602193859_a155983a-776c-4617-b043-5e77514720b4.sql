
REVOKE EXECUTE ON FUNCTION public.is_projects_subscriber(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_paid_plan(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assert_projects_write_allowed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_core_scan_quota() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_core_scan_quota() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.peek_core_scan_quota() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_participant_digest_event(uuid, uuid, jsonb) FROM PUBLIC;
