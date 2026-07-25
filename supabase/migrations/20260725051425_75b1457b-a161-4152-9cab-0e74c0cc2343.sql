
-- DIO A: Popravi nepotpuni REVOKE iz Faze 1 (PUBLIC + anon)
-- Uzrok: prethodna Faza 1 je pisala samo REVOKE ... FROM anon, ali funkcije
-- imaju grant kroz PUBLIC (anon je član PUBLIC), pa je efektivna privilegija ostala.

REVOKE EXECUTE ON FUNCTION public.consume_invitation_token(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_invitation_token(text, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_ai_usage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_messages() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_diagnostic_logs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_health_summaries() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_login_logs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_monitor_alerts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_push_logs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_push_tokens() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_expired_invitations() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_module_grant(uuid, admin_grant_module) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_full_payment_source_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_budget_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_budget_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_investor(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_participant_active(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_payment_source_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_payment_source_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_income_source_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_income_source_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_push_category_enabled(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_log_own_work(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_payment_source(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_project_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.payment_source_role(uuid, uuid) FROM PUBLIC, anon;

-- DIO C: Spriječi da nove funkcije u shemi public dobiju PUBLIC EXECUTE po defaultu.
-- Buduće funkcije morat će eksplicitno GRANT-ati pristup rolama koje ga trebaju.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
