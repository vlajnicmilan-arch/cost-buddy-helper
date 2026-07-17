// Coverage test: every public-schema table must be categorized in
// tablesToPurge.ts. Fails when a new table is added without being placed.
//
// Run: deno test supabase/functions/_shared/__tests__/purgeUser.coverage.test.ts
//
// The snapshot below is the live information_schema.public BASE TABLE list,
// captured during the Hard Delete Foundation pass. Update it deliberately
// when a migration adds/removes tables — that update is the trigger for
// re-categorizing in tablesToPurge.ts.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { categorizeTable } from "../tablesToPurge.ts";

const PUBLIC_TABLES_SNAPSHOT = [
  "account_deletion_log","activation_nudge_log","admin_module_grants","ai_insights_cache",
  "ai_usage_daily","app_diagnostics_logs","app_settings","bank_accounts","bank_connections",
  "budget_categories","budget_invitations","budget_members","budget_plans","bug_reports",
  "business_debts","business_premises","business_profiles","cash_registers","chat_messages",
  "clients","core_scan_usage","custom_categories","custom_payment_sources",
  "dashboard_hidden_sources","dashboard_telemetry","email_send_log",
  "email_send_state","email_unsubscribe_tokens","expenses","feedback_submissions",
  "funnel_events","health_summaries","imported_statements","income_source_invitations",
  "income_source_members","income_sources","installment_plans","installments",
  "inventory_items","inventory_movements","invoice_items","invoice_reminders","invoices",
  "krug","krug_act_dedup","krug_deletion_request","krug_deletion_vote","krug_membership",
  "krug_ownership","krug_shared_payment_source",
  "milestone_budget_alerts","milestone_budget_revisions","milestone_checklist_items",
  "monitor_alerts_log","notification_preferences","notifications","participant_digest_state",
  "payment_source_cards","payment_source_invitations","payment_source_members",
  "pdf_parse_jobs","profiles","project_activity_log","project_activity_push_throttle",
  "project_budget_revisions","project_collaborators","project_contract_amendments",
  "project_documents","project_estimates","project_funding","project_invitations",
  "project_invoices","project_member_permissions","project_members","project_milestones",
  "project_share_links","project_templates","project_work_entries","project_work_logs",
  "project_workers","projects","push_delivery_logs","push_tokens","receipt_items",
  "recurring_transactions","referrals","reminders","savings_goals",
  "support_tickets","suppressed_emails","transaction_notes",
  "travel_order_expenses","travel_orders","user_login_logs","user_memories","user_roles",
  "user_subscriptions",
];

Deno.test("every public table is categorized in tablesToPurge.ts", () => {
  const uncategorized: string[] = [];
  for (const table of PUBLIC_TABLES_SNAPSHOT) {
    if (!categorizeTable(table)) uncategorized.push(table);
  }
  assertEquals(
    uncategorized,
    [],
    `Uncategorized tables (add them to tablesToPurge.ts or NON_USER_TABLES): ${uncategorized.join(", ")}`,
  );
});
