-- Faza 1: REVOKE EXECUTE FROM anon za nisko-rizične SECDEF funkcije
-- Grupa A
REVOKE EXECUTE ON FUNCTION public.consume_invitation_token(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_invitation_token(text, uuid) FROM anon;

-- Grupa B
REVOKE EXECUTE ON FUNCTION public.cleanup_duplicate_push_tokens() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_ai_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_messages() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_diagnostic_logs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_health_summaries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_login_logs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_monitor_alerts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_push_logs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_push_tokens() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_expired_invitations() FROM anon;

-- Grupa C
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_any_paid_plan(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_module_grant(uuid, admin_grant_module) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_full_payment_source_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_budget_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_budget_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_project_investor(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_project_participant_active(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_projects_subscriber(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_payment_source_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_payment_source_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_income_source_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_income_source_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_push_category_enabled(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_log_own_work(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_payment_source(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_project_role(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.payment_source_role(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assert_projects_write_allowed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_project_member_profiles(uuid) FROM anon;