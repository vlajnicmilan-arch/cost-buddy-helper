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
  v_done int := 0;
  v_skipped int := 0;
BEGIN
  FOR v_sig IN
    SELECT s FROM (VALUES
      ('public.admin_get_cohort_retention()'),
      ('public.apply_balance_delta_if_unanchored(uuid, numeric)'),
      ('public.apply_split_override(uuid, jsonb)'),
      ('public.assert_projects_write_allowed()'),
      ('public.audit_secdef_anon_regression()'),
      ('public.auto_reject_expired_pending_expenses(interval)'),
      ('public.can_log_own_work(uuid, uuid)'),
      ('public.can_write_payment_source(uuid, uuid)'),
      ('public.cleanup_duplicate_push_tokens()'),
      ('public.cleanup_old_ai_usage()'),
      ('public.cleanup_old_chat_messages()'),
      ('public.cleanup_old_diagnostic_logs()'),
      ('public.cleanup_old_health_summaries()'),
      ('public.cleanup_old_login_logs()'),
      ('public.cleanup_old_monitor_alerts()'),
      ('public.cleanup_old_push_logs()'),
      ('public.cleanup_stale_push_tokens()'),
      ('public.complete_onboarding(text, text, numeric, text, jsonb)'),
      ('public.consume_core_scan_quota()'),
      ('public.consume_invitation_token(text, text)'),
      ('public.consume_invitation_token(text, uuid)'),
      ('public.create_worker_payout(uuid,uuid,date,date,numeric,text,timestamptz,text,boolean)'),
      ('public.create_worker_payout_batch(jsonb,text,timestamptz,text,boolean)'),
      ('public.delete_email(text, bigint)'),
      ('public.delete_expired_invitations()'),
      ('public.dismiss_notification(uuid)'),
      ('public.drain_participant_digest(uuid, uuid)'),
      ('public.email_queue_dispatch()'),
      ('public.enforce_free_budget_cap()'),
      ('public.enforce_free_payment_source_cap()'),
      ('public.enforce_free_transaction_cap()'),
      ('public.enqueue_email(text, jsonb)'),
      ('public.enqueue_participant_digest_event(uuid, uuid, jsonb)'),
      ('public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid)'),
      ('public.filter_projects_subscribers(uuid[])'),
      ('public.get_ai_monthly_spend()'),
      ('public.get_dashboard_scroll_distribution(integer)'),
      ('public.get_dashboard_section_stats(integer)'),
      ('public.get_free_tier_usage_current_month(UUID)'),
      ('public.get_free_tier_usage_current_month(uuid)'),
      ('public.get_investor_project_phases(uuid)'),
      ('public.get_krug_shared_source_display(uuid)'),
      ('public.get_my_incoming_payouts(uuid[])'),
      ('public.get_project_member_profiles(uuid)'),
      ('public.get_project_role(uuid, uuid)'),
      ('public.get_public_profiles(uuid[])'),
      ('public.grant_module_access(uuid, admin_grant_module[], timestamptz, admin_grant_reason_code, text)'),
      ('public.has_active_module_grant(uuid, admin_grant_module)'),
      ('public.has_any_paid_plan(uuid)'),
      ('public.has_full_payment_source_access(uuid, uuid)'),
      ('public.has_role(uuid, app_role)'),
      ('public.increment_ai_usage(text, integer)'),
      ('public.increment_ai_usage_v2(text, integer, integer)'),
      ('public.increment_free_tier_counter()'),
      ('public.is_budget_member(uuid, uuid)'),
      ('public.is_budget_owner(uuid, uuid)'),
      ('public.is_income_source_member(uuid, uuid)'),
      ('public.is_income_source_owner(uuid, uuid)'),
      ('public.is_payment_source_member(uuid, uuid)'),
      ('public.is_payment_source_owner(uuid, uuid)'),
      ('public.is_project_investor(uuid, uuid)'),
      ('public.is_project_member(uuid, uuid)'),
      ('public.is_project_owner(uuid, uuid)'),
      ('public.is_project_participant_active(uuid, uuid)'),
      ('public.is_projects_subscriber(uuid)'),
      ('public.is_push_category_enabled(uuid, text)'),
      ('public.krug_apply_act(uuid, text, text)'),
      ('public.krug_bootstrap_creator()'),
      ('public.krug_can_manage_shared_source(uuid, uuid, text)'),
      ('public.krug_can_see_personal(uuid, uuid, uuid)'),
      ('public.krug_cancel_deletion(uuid)'),
      ('public.krug_cleanup_act_dedup()'),
      ('public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[])'),
      ('public.krug_enforce_punopravni_cap()'),
      ('public.krug_expire_predlozena()'),
      ('public.krug_govern_to_personal(uuid, text)'),
      ('public.krug_is_full_member(uuid, uuid)'),
      ('public.krug_is_member(uuid, uuid)'),
      ('public.krug_is_owner(uuid, uuid)'),
      ('public.krug_notify_all_members(uuid)'),
      ('public.krug_notify_full_members(uuid)'),
      ('public.krug_purge_deleted(int)'),
      ('public.krug_purge_deleted(integer)'),
      ('public.krug_request_deletion(uuid, text)'),
      ('public.krug_retract(uuid, text)'),
      ('public.krug_set_privacy(uuid, public.krug_privacy)'),
      ('public.krug_settlement_preview(uuid, date, date, text, jsonb)'),
      ('public.krug_shares_krug_with(uuid, uuid)'),
      ('public.krug_vote_deletion(uuid, boolean)'),
      ('public.krug_withdraw(uuid, text)'),
      ('public.link_worker_to_member(uuid, uuid)'),
      ('public.list_trash()'),
      ('public.mark_guided_home_exited()'),
      ('public.merge_manual_with_bank(uuid, uuid)'),
      ('public.move_to_dlq(text, text, bigint, jsonb)'),
      ('public.payment_source_role(uuid, uuid)'),
      ('public.peek_core_scan_quota()'),
      ('public.preview_worker_earnings(uuid, uuid, date, date)'),
      ('public.preview_worker_payout(uuid,uuid,date,date)'),
      ('public.purge_old_trash(integer)'),
      ('public.purge_trash_item(text, uuid)'),
      ('public.rate_at(uuid, date)'),
      ('public.read_email_batch(text, integer, integer)'),
      ('public.recompute_custom_source_balance(uuid)'),
      ('public.recompute_custom_source_balance_preview(uuid, text)'),
      ('public.record_ai_cost(text)'),
      ('public.refresh_family_split_snapshot(uuid, date, date)'),
      ('public.refund_core_scan_quota()'),
      ('public.resolve_stale_issues(text, text[])'),
      ('public.restore_trash_item(text, uuid)'),
      ('public.review_project_expense(uuid, text, text)'),
      ('public.revoke_module_access(uuid, text)'),
      ('public.set_source_anchor(uuid, timestamptz, numeric, jsonb)'),
      ('public.set_worker_hourly_rate(uuid, numeric, date)'),
      ('public.soft_delete_record(text, uuid)'),
      ('public.undo_import_batch(uuid)'),
      ('public.unlock_work_entry(uuid,text)'),
      ('public.unmerge_import_row(uuid)'),
      ('public.update_locked_work_entry(uuid,numeric,text,text)'),
      ('public.upsert_active_issue(text, text, text, text, text, jsonb, text, uuid)'),
      ('public.void_worker_payout(uuid,text)'),
      ('public.void_worker_payout_batch(uuid,text)')
    ) AS t(s)
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_sig);
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'ci_prod_revokes: primijenjeno %, preskoceno % (ne postoje u CI shemi)',
    v_done, v_skipped;
END
$replay$;
