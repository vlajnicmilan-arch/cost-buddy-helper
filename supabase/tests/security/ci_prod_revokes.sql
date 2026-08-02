-- CI-only: vjeran replay produkcijskih REVOKE ... FROM anon migracija.
--
-- Kurirani CI baseline ne primjenjuje sve produkcijske migracije, pa funkcije
-- koje u produkciji jesu revokirane u CI-ju ostaju anon-izvršive. Ovo NIJE
-- popis iznimaka: signature su izvučene doslovno iz `REVOKE EXECUTE ON
-- FUNCTION ... FROM anon` naredbi u supabase/migrations/*.sql. Funkcija koja
-- u CI shemi ne postoji preskače se; funkcija koja postoji dobiva isti REVOKE
-- kao u produkciji. Ako migracija doda novu SECDEF funkciju bez REVOKE-a,
-- ovdje je nema → secdef_anon_invariant.sql pada. Regeneriraj po potrebi:
--   grep -h '^REVOKE EXECUTE ON FUNCTION' supabase/migrations/*.sql
--
-- Pokreće se nakon migracija, prije secdef_anon_shim.sql.

DO $replay$
DECLARE
  v_sig text;
  v_roles text;
  v_done int := 0;
  v_skipped int := 0;
BEGIN
  FOR v_sig, v_roles IN
    SELECT s, r FROM (VALUES
      ('public.admin_get_cohort_retention()', 'anon, PUBLIC'),
      ('public.apply_balance_delta_if_unanchored(uuid, numeric)', 'anon, PUBLIC'),
      ('public.apply_split_override(uuid, jsonb)', 'anon, PUBLIC'),
      ('public.assert_projects_write_allowed()', 'anon'),
      ('public.audit_secdef_anon_regression()', 'PUBLIC, anon'),
      ('public.auto_reject_expired_pending_expenses(interval)', 'anon, authenticated'),
      ('public.can_log_own_work(uuid, uuid)', 'PUBLIC, anon'),
      ('public.can_write_payment_source(uuid, uuid)', 'PUBLIC, anon'),
      ('public.cleanup_duplicate_push_tokens()', 'anon'),
      ('public.cleanup_old_ai_usage()', 'PUBLIC, anon'),
      ('public.cleanup_old_chat_messages()', 'PUBLIC, anon'),
      ('public.cleanup_old_diagnostic_logs()', 'PUBLIC, anon'),
      ('public.cleanup_old_health_summaries()', 'PUBLIC, anon'),
      ('public.cleanup_old_login_logs()', 'PUBLIC, anon'),
      ('public.cleanup_old_monitor_alerts()', 'PUBLIC, anon'),
      ('public.cleanup_old_push_logs()', 'PUBLIC, anon'),
      ('public.cleanup_stale_push_tokens()', 'PUBLIC, anon'),
      ('public.complete_onboarding(text, text, numeric, text, jsonb)', 'anon, PUBLIC'),
      ('public.consume_core_scan_quota()', 'anon, PUBLIC'),
      ('public.consume_invitation_token(text, text)', 'PUBLIC, anon'),
      ('public.consume_invitation_token(text, uuid)', 'PUBLIC, anon'),
      ('public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean)', 'anon'),
      ('public.create_worker_payout_batch(jsonb,text,timestamptz,text,boolean)', 'anon'),
      ('public.delete_email(text, bigint)', 'anon, authenticated, PUBLIC'),
      ('public.delete_expired_invitations()', 'PUBLIC, anon'),
      ('public.dismiss_notification(uuid)', 'anon, PUBLIC'),
      ('public.drain_participant_digest(uuid, uuid)', 'anon'),
      ('public.email_queue_dispatch()', 'anon, authenticated, PUBLIC'),
      ('public.enforce_free_budget_cap()', 'anon, authenticated'),
      ('public.enforce_free_payment_source_cap()', 'anon, authenticated'),
      ('public.enforce_free_transaction_cap()', 'anon, authenticated'),
      ('public.enqueue_email(text, jsonb)', 'anon, authenticated, PUBLIC'),
      ('public.enqueue_participant_digest_event(uuid, uuid, jsonb)', 'anon'),
      ('public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid)', 'anon'),
      ('public.filter_projects_subscribers(uuid[])', 'anon, PUBLIC'),
      ('public.get_ai_monthly_spend()', 'PUBLIC, anon'),
      ('public.get_dashboard_scroll_distribution(integer)', 'anon, PUBLIC'),
      ('public.get_dashboard_section_stats(integer)', 'anon, PUBLIC'),
      ('public.get_free_tier_usage_current_month(UUID)', 'anon'),
      ('public.get_free_tier_usage_current_month(uuid)', 'anon, PUBLIC'),
      ('public.get_investor_project_phases(uuid)', 'PUBLIC, anon'),
      ('public.get_krug_shared_source_display(uuid)', 'PUBLIC, anon'),
      ('public.get_my_incoming_payouts(uuid[])', 'anon'),
      ('public.get_project_member_profiles(uuid)', 'anon'),
      ('public.get_project_role(uuid, uuid)', 'PUBLIC, anon'),
      ('public.get_public_profiles(uuid[])', 'PUBLIC, anon'),
      ('public.grant_module_access(uuid, admin_grant_module[], timestamptz, admin_grant_reason_code, text)', 'anon, PUBLIC'),
      ('public.has_active_module_grant(uuid, admin_grant_module)', 'PUBLIC, anon'),
      ('public.has_any_paid_plan(uuid)', 'anon'),
      ('public.has_full_payment_source_access(uuid, uuid)', 'PUBLIC, anon'),
      ('public.has_role(uuid, app_role)', 'PUBLIC, anon'),
      ('public.increment_ai_usage(text, integer)', 'anon, PUBLIC'),
      ('public.increment_ai_usage_v2(text, integer, integer)', 'anon, PUBLIC'),
      ('public.increment_free_tier_counter()', 'anon, authenticated'),
      ('public.is_budget_member(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_budget_owner(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_income_source_member(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_income_source_owner(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_payment_source_member(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_payment_source_owner(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_project_investor(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_project_member(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_project_owner(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_project_participant_active(uuid, uuid)', 'PUBLIC, anon'),
      ('public.is_projects_subscriber(uuid)', 'anon'),
      ('public.is_push_category_enabled(uuid, text)', 'PUBLIC, anon'),
      ('public.krug_apply_act(uuid, text, text)', 'PUBLIC, anon'),
      ('public.krug_bootstrap_creator()', 'PUBLIC, anon, authenticated'),
      ('public.krug_can_manage_shared_source(uuid, uuid, text)', 'PUBLIC, anon'),
      ('public.krug_can_see_personal(uuid, uuid, uuid)', 'PUBLIC, anon'),
      ('public.krug_cancel_deletion(uuid)', 'anon'),
      ('public.krug_cleanup_act_dedup()', 'PUBLIC, anon, authenticated'),
      ('public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[])', 'PUBLIC, anon, authenticated'),
      ('public.krug_enforce_punopravni_cap()', 'PUBLIC, anon, authenticated'),
      ('public.krug_expire_predlozena()', 'PUBLIC, anon, authenticated'),
      ('public.krug_govern_to_personal(uuid, text)', 'PUBLIC, anon'),
      ('public.krug_is_full_member(uuid, uuid)', 'PUBLIC, anon'),
      ('public.krug_is_member(uuid, uuid)', 'PUBLIC, anon'),
      ('public.krug_is_owner(uuid, uuid)', 'PUBLIC, anon'),
      ('public.krug_notify_all_members(uuid)', 'PUBLIC, anon, authenticated'),
      ('public.krug_notify_full_members(uuid)', 'PUBLIC, anon, authenticated'),
      ('public.krug_purge_deleted(int)', 'PUBLIC, anon'),
      ('public.krug_purge_deleted(integer)', 'PUBLIC, anon, authenticated'),
      ('public.krug_request_deletion(uuid, text)', 'PUBLIC, anon'),
      ('public.krug_retract(uuid, text)', 'PUBLIC, anon'),
      ('public.krug_set_privacy(uuid, public.krug_privacy)', 'PUBLIC, anon'),
      ('public.krug_settlement_preview(uuid, date, date, text, jsonb)', 'anon'),
      ('public.krug_shares_krug_with(uuid, uuid)', 'PUBLIC, anon'),
      ('public.krug_vote_deletion(uuid, boolean)', 'PUBLIC, anon'),
      ('public.krug_withdraw(uuid, text)', 'PUBLIC, anon'),
      ('public.link_worker_to_member(uuid, uuid)', 'anon, PUBLIC'),
      ('public.list_trash()', 'anon, PUBLIC'),
      ('public.mark_guided_home_exited()', 'anon, PUBLIC'),
      ('public.merge_manual_with_bank(uuid, uuid)', 'anon, PUBLIC'),
      ('public.move_to_dlq(text, text, bigint, jsonb)', 'anon, authenticated, PUBLIC'),
      ('public.payment_source_role(uuid, uuid)', 'PUBLIC, anon'),
      ('public.peek_core_scan_quota()', 'anon, PUBLIC'),
      ('public.preview_worker_earnings(uuid, uuid, date, date)', 'anon'),
      ('public.preview_worker_payout(uuid,uuid,date,date)', 'anon'),
      ('public.purge_old_trash(integer)', 'anon, PUBLIC'),
      ('public.purge_trash_item(text, uuid)', 'anon, PUBLIC'),
      ('public.rate_at(uuid, date)', 'anon'),
      ('public.read_email_batch(text, integer, integer)', 'anon, authenticated, PUBLIC'),
      ('public.recompute_custom_source_balance(uuid)', 'anon, PUBLIC'),
      ('public.recompute_custom_source_balance_preview(uuid, text)', 'anon, PUBLIC'),
      ('public.record_ai_cost(text)', 'PUBLIC, anon'),
      ('public.refresh_family_split_snapshot(uuid, date, date)', 'anon, PUBLIC'),
      ('public.refund_core_scan_quota()', 'anon, PUBLIC'),
      ('public.resolve_stale_issues(text, text[])', 'anon, PUBLIC'),
      ('public.restore_trash_item(text, uuid)', 'anon, PUBLIC'),
      ('public.review_project_expense(uuid, text, text)', 'anon'),
      ('public.revoke_module_access(uuid, text)', 'anon, PUBLIC'),
      ('public.set_source_anchor(uuid, timestamptz, numeric, jsonb)', 'anon'),
      ('public.set_worker_hourly_rate(uuid, numeric, date)', 'anon'),
      ('public.soft_delete_record(text, uuid)', 'anon, PUBLIC'),
      ('public.undo_import_batch(uuid)', 'PUBLIC, anon'),
      ('public.unlock_work_entry(uuid,text)', 'anon'),
      ('public.unmerge_import_row(uuid)', 'anon, PUBLIC'),
      ('public.update_locked_work_entry(uuid,numeric,text,text)', 'anon'),
      ('public.upsert_active_issue(text, text, text, text, text, jsonb, text, uuid)', 'anon, PUBLIC'),
      ('public.void_worker_payout(uuid,text)', 'anon'),
      ('public.void_worker_payout_batch(uuid,text)', 'anon')
    ) AS t(s, r)
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %s', v_sig, v_roles);
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'ci_prod_revokes: primijenjeno %, preskoceno % (ne postoje u CI shemi)',
    v_done, v_skipped;
END
$replay$;
