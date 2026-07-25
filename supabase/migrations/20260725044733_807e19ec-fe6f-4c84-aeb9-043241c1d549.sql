-- Grupa: balance / trash / recompute (samo anon revoke)
REVOKE EXECUTE ON FUNCTION public.apply_balance_delta_if_unanchored(uuid, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_old_trash(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_custom_source_balance(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_custom_source_balance_preview(uuid, text) FROM anon, PUBLIC;

-- Digest (authenticated zadržava — useProjectFunding hook koristi)
REVOKE EXECUTE ON FUNCTION public.enqueue_participant_digest_event(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.drain_participant_digest(uuid, uuid) FROM anon;

-- Email queue: samo service_role
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, PUBLIC;