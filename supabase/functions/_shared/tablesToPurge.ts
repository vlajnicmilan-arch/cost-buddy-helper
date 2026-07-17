// Canonical, categorized purge inventory.
// SINGLE SOURCE OF TRUTH for what "fully deleted user" means.
//
// Every public-schema table MUST appear in exactly one of:
//   - PURGE_BY_USER_ID
//   - PURGE_BY_EMAIL
//   - PURGE_DEPENDENT
//   - INTENTIONALLY_KEPT
//   - NON_USER_TABLES
//
// The coverage test enforces this against the live information_schema snapshot.

export interface DependentTable {
  table: string;
  /** How this table is joined back to the user being purged. */
  via:
    | "expense_id"
    | "invoice_id"
    | "travel_order_id"
    | "budget_id"
    | "project_id"
    | "krug_id"
    | "created_by"
    | "generated_by"
    | "referrer_or_referred";
  /** Optional parent table whose rows scope the dependent rows. */
  parentTable?: string;
  /** Column name on the dependent table that holds the join key. */
  column: string;
}

export interface EmailTable {
  table: string;
  column: string;
}

// ---------------------------------------------------------------------------
// PHASE 1 — dependent rows (must be deleted BEFORE their parents)
// ---------------------------------------------------------------------------
export const PURGE_DEPENDENT: readonly DependentTable[] = [
  // Receipt / expense children
  { table: "receipt_items", via: "expense_id", parentTable: "expenses", column: "expense_id" },
  { table: "inventory_movements", via: "expense_id", parentTable: "expenses", column: "expense_id" },

  // Invoice children
  { table: "invoice_items", via: "invoice_id", parentTable: "invoices", column: "invoice_id" },
  { table: "invoice_reminders", via: "invoice_id", parentTable: "invoices", column: "invoice_id" },

  // Travel order children
  { table: "travel_order_expenses", via: "travel_order_id", parentTable: "travel_orders", column: "travel_order_id" },

  // Budget children
  { table: "budget_categories", via: "budget_id", parentTable: "budget_plans", column: "budget_id" },

  // Project children (joined via projects.user_id)
  { table: "project_collaborators", via: "project_id", parentTable: "projects", column: "project_id" },
  { table: "project_documents", via: "project_id", parentTable: "projects", column: "project_id" },
  { table: "project_funding", via: "project_id", parentTable: "projects", column: "project_id" },
  { table: "project_share_links", via: "project_id", parentTable: "projects", column: "project_id" },
  { table: "project_work_entries", via: "project_id", parentTable: "projects", column: "project_id" },
  { table: "project_milestones", via: "project_id", parentTable: "projects", column: "project_id" },

  // Krug children (joined via krug_ownership.user_id)
  { table: "krug_deletion_request", via: "krug_id", parentTable: "krug", column: "krug_id" },
  { table: "krug_shared_payment_source", via: "krug_id", parentTable: "krug", column: "krug_id" },

  // Created-by ownership (no user_id column)
  { table: "project_templates", via: "created_by", column: "created_by" },
  { table: "health_summaries", via: "generated_by", column: "generated_by" },

  // Referrals (two columns OR-ed)
  { table: "referrals", via: "referrer_or_referred", column: "referrer_id" },
];

// ---------------------------------------------------------------------------
// PHASE 2 — user-owned (delete by user_id). Order respects FK-less topology
// (dependents from PHASE 1 already handled). The list is split into "leaf"
// children that hold join keys and the top-level parents, so that running
// them in array order is safe.
// ---------------------------------------------------------------------------
export const PURGE_BY_USER_ID: readonly string[] = [
  // --- leaf membership / dependent-on-parent (must precede parents) ---
  "krug_deletion_vote",
  "krug_membership",
  "krug_ownership",
  "krug_act_dedup",
  "payment_source_members",
  "payment_source_cards",
  "budget_members",
  "income_source_members",
  "milestone_checklist_items",
  "milestone_budget_alerts",
  "milestone_budget_revisions",
  "project_activity_log",
  "project_activity_push_throttle",
  "project_budget_revisions",
  "project_contract_amendments",
  "project_estimates",
  "project_invoices",
  "project_member_permissions",
  "project_members",
  "project_work_logs",
  "project_workers",
  "installments",

  // --- top-level user-owned ---
  "expenses",                 // after receipt_items + inventory_movements
  "recurring_transactions",
  "transaction_notes",
  "installment_plans",
  "budget_plans",             // after budget_categories
  "income_sources",
  "custom_payment_sources",
  "custom_categories",
  "savings_goals",
  "invoices",                 // after invoice_items + invoice_reminders
  "travel_orders",            // after travel_order_expenses
  "inventory_items",
  "business_debts",
  "business_premises",
  "cash_registers",
  "clients",
  "projects",                 // after ALL project_* dependents
  "business_profiles",

  // banking
  "bank_accounts",
  "bank_connections",
  "imported_statements",
  "pdf_parse_jobs",

  // messaging / notifications
  "notifications",
  "notification_preferences",
  "push_tokens",
  "push_delivery_logs",
  "reminders",
  "chat_messages",
  "participant_digest_state",

  // ai / usage / telemetry
  "ai_insights_cache",
  "ai_usage_daily",
  "core_scan_usage",
  "dashboard_hidden_sources",
  "dashboard_telemetry",
  "funnel_events",
  "activation_nudge_log",
  "user_memories",
  "user_login_logs",

  // user-submitted records
  "feedback_submissions",
  "bug_reports",
  "support_tickets",
  // dpa_requests: table dropped (generators removed)

  // subscription
  "user_subscriptions",

  // diagnostics + roles
  "app_diagnostics_logs",
  "user_roles",

  // krug parent (after all krug_* children) — only reached when solo
  "krug",

  // profile last before auth.deleteUser
  "profiles",
];

// ---------------------------------------------------------------------------
// PHASE 3 — invitations & subscriptions keyed by email
// ---------------------------------------------------------------------------
export const PURGE_BY_EMAIL: readonly EmailTable[] = [
  { table: "budget_invitations", column: "email" },
  { table: "payment_source_invitations", column: "email" },
  { table: "project_invitations", column: "email" },
  { table: "income_source_invitations", column: "email" },
  { table: "email_unsubscribe_tokens", column: "email" },
  { table: "suppressed_emails", column: "email" },
];

// ---------------------------------------------------------------------------
// PHASE 4 — storage buckets with per-user prefix
// ---------------------------------------------------------------------------
export const STORAGE_BUCKETS: readonly string[] = [
  "receipts",
  "certificates",
  "project-documents",
  "invoice-pdfs",
];

// ---------------------------------------------------------------------------
// Conditionally purged — only with policy.deletePaidRecords
// (currently empty — Stripe/lifetime tables were removed with the Paddle switch)
// ---------------------------------------------------------------------------
export const PAID_RECORDS_TABLES: readonly string[] = [];

// ---------------------------------------------------------------------------
// INTENTIONALLY KEPT — audit / financial trail. Not deleted.
// ---------------------------------------------------------------------------
export const INTENTIONALLY_KEPT: readonly { table: string; reason: string }[] = [
  { table: "account_deletion_log", reason: "GDPR audit (90 days); email is anonymized in-place" },
  { table: "admin_module_grants", reason: "Admin action audit (granted_by/revoked_by trail)" },
];

// ---------------------------------------------------------------------------
// NON_USER_TABLES — system / global tables that never hold user data.
// ---------------------------------------------------------------------------
export const NON_USER_TABLES: readonly string[] = [
  "app_settings",
  "email_send_log",         // outbound delivery audit
  "email_send_state",       // global delivery state
  "monitor_alerts_log",     // system monitoring
];

// ---------------------------------------------------------------------------
// Categorization helper used by the coverage test.
// ---------------------------------------------------------------------------
export function categorizeTable(table: string): string | null {
  if (PURGE_BY_USER_ID.includes(table)) return "PURGE_BY_USER_ID";
  if (PURGE_BY_EMAIL.some((t) => t.table === table)) return "PURGE_BY_EMAIL";
  if (PURGE_DEPENDENT.some((t) => t.table === table)) return "PURGE_DEPENDENT";
  if (INTENTIONALLY_KEPT.some((t) => t.table === table)) return "INTENTIONALLY_KEPT";
  if (NON_USER_TABLES.includes(table)) return "NON_USER_TABLES";
  if (PAID_RECORDS_TABLES.includes(table)) return "PAID_RECORDS_TABLES";
  return null;
}
