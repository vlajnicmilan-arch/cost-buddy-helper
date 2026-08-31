/**
 * JEDINI izvor istine o tome što pripada korisniku pri izvozu podataka.
 *
 * Pravilo: SVAKA tablica u shemi `public` mora imati unos ovdje — ili s
 * pravilom vlasništva, ili izričito isključena s razlogom. Test
 * `src/test/exportRegistryCoverage.test.ts` čita živu shemu u trenutku
 * pokretanja i pada čim se pojavi tablica koja nije pokrivena.
 *
 * Nikad ne dodavati „ostalo" ili tihi preskok — tiho gutanje je upravo bolest
 * koju ovaj registar liječi.
 */

/** Imenovani skupovi id-eva roditelja (npr. „moji projekti"). */
export type ScopeName =
  | 'projects'
  | 'budgets'
  | 'expenses'
  | 'krugs'
  | 'milestones'
  | 'decisions'
  | 'workers'
  | 'paymentSources'
  | 'incomeSources'
  | 'inventoryItems'
  | 'travelOrders'
  | 'projectInvoices'
  | 'workerPayouts'
  | 'inboundMessages'
  | 'ingestItems';

export type OwnerRule =
  /** Stupac koji izravno drži id korisnika. */
  | { via: 'column'; column: string }
  /** Bilo koji od stupaca drži id korisnika (npr. from_user / to_user). */
  | { via: 'orColumns'; columns: string[] }
  /** Vlasništvo preko roditelja: `column` mora biti u skupu id-eva `scope`. */
  | { via: 'scope'; column: string; scope: ScopeName }
  /** Izričito isključeno — razlog je obavezan i ide u manifest. */
  | { via: 'excluded'; reason: string };

export interface TableRule {
  rule: OwnerRule;
  /**
   * Odakle se čita, ako to nije sama tablica. Faze se OBAVEZNO čitaju kroz
   * role-scoped pogled `project_milestones_scoped` (Korak A) — skriveni iznosi
   * ostaju prazni umjesto da se izvezu.
   */
  readFrom?: string;
  /** Stupci koji se brišu iz izvoza (ključevi, tokeni) — ne podaci. */
  redact?: readonly string[];
}

/** Definicija skupa id-eva roditelja. Sam skup se dohvaća istim pravilima. */
export interface ScopeDef {
  table: string;
  /** Stupac čije se vrijednosti skupljaju (obično `id`). */
  idColumn: string;
  rule: OwnerRule;
}

export const SCOPES: Record<ScopeName, ScopeDef> = {
  projects: { table: 'projects', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  budgets: { table: 'budget_plans', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  expenses: { table: 'expenses', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  krugs: { table: 'krug_membership', idColumn: 'krug_id', rule: { via: 'column', column: 'user_id' } },
  milestones: { table: 'project_milestones_scoped', idColumn: 'id', rule: { via: 'scope', column: 'project_id', scope: 'projects' } },
  decisions: { table: 'project_decisions', idColumn: 'id', rule: { via: 'scope', column: 'project_id', scope: 'projects' } },
  workers: { table: 'workers', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  paymentSources: { table: 'custom_payment_sources', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  incomeSources: { table: 'income_sources', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  inventoryItems: { table: 'inventory_items', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  travelOrders: { table: 'travel_orders', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  projectInvoices: { table: 'project_invoices', idColumn: 'id', rule: { via: 'column', column: 'user_id' } },
  workerPayouts: { table: 'project_worker_payouts', idColumn: 'id', rule: { via: 'scope', column: 'project_id', scope: 'projects' } },
  inboundMessages: { table: 'inbound_messages', idColumn: 'id', rule: { via: 'column', column: 'owner_user_id' } },
  ingestItems: { table: 'document_ingest_items', idColumn: 'id', rule: { via: 'column', column: 'owner_user_id' } },
};

const direct = (): TableRule => ({ rule: { via: 'column', column: 'user_id' } });
const col = (column: string): TableRule => ({ rule: { via: 'column', column } });
const scope = (column: string, s: ScopeName, redact?: readonly string[]): TableRule => ({
  rule: { via: 'scope', column, scope: s },
  redact,
});
const excluded = (reason: string): TableRule => ({ rule: { via: 'excluded', reason } });

/** Razlozi isključenja — kratko i ljudski, ide doslovno u manifest. */
const R = {
  internal: 'Interna evidencija sustava, nije korisnikov sadržaj.',
  telemetry: 'Anonimna telemetrija i dijagnostika, nije korisnikov sadržaj.',
  metering: 'Interno brojanje potrošnje (kvote), izvedeno iz drugih podataka.',
  admin: 'Administrativni zapis, nije korisnikov sadržaj.',
  secrets: 'Sadrži ključeve/tokene — sigurnosni rizik, nisu podaci.',
  derived: 'Izvedena predmemorija, ponovno se izračunava iz izvezenih podataka.',
  others: 'Sadrži osobne podatke drugih ljudi bez korisnikova udjela.',
} as const;

export const EXPORT_REGISTRY: Record<string, TableRule> = {
  // — Identitet i postavke —
  profiles: direct(),
  notification_preferences: direct(),
  user_entitlements: direct(),
  user_subscriptions: direct(),
  newsletter_consents: direct(),
  user_memories: direct(),
  dashboard_hidden_sources: direct(),
  feedback_submissions: direct(),
  support_tickets: direct(),
  bug_reports: direct(),
  referrals: col('referrer_id'),

  // — Novac —
  expenses: direct(),
  receipt_items: scope('expense_id', 'expenses'),
  transaction_notes: direct(),
  category_corrections: direct(),
  custom_categories: direct(),
  custom_payment_sources: direct(),
  payment_source_cards: direct(),
  payment_source_members: scope('payment_source_id', 'paymentSources'),
  payment_source_invitations: scope('payment_source_id', 'paymentSources', ['token']),
  income_sources: direct(),
  income_source_members: scope('income_source_id', 'incomeSources'),
  income_source_invitations: scope('income_source_id', 'incomeSources', ['token']),
  anchor_audit: direct(),
  recurring_transactions: direct(),
  installment_plans: direct(),
  installments: direct(),
  savings_goals: direct(),
  reminders: direct(),
  notifications: direct(),
  budget_plans: direct(),
  budget_categories: scope('budget_id', 'budgets'),
  budget_members: scope('budget_id', 'budgets'),
  budget_invitations: scope('budget_id', 'budgets', ['token']),

  // — Banka i uvoz —
  bank_accounts: direct(),
  bank_connections: { rule: { via: 'column', column: 'user_id' }, redact: ['state_token'] },
  imported_statements: direct(),
  import_transfer_rules: direct(),

  // — Pošta i dokumenti —
  mail_aliases: direct(),
  mail_issuer_memory: direct(),
  mail_rejection_memory: direct(),
  mail_statement_source_map: direct(),
  inbound_messages: col('owner_user_id'),
  inbound_attachments: scope('message_id', 'inboundMessages'),
  document_ingest_items: col('owner_user_id'),
  document_links: scope('item_id', 'ingestItems'),
  incoming_invoices: direct(),
  eracun_counterparty_iban: direct(),
  eracun_payment_links: direct(),

  // — Biznis —
  business_profiles: direct(),
  business_premises: direct(),
  business_debts: direct(),
  cash_registers: direct(),
  clients: direct(),
  inventory_items: direct(),
  inventory_movements: scope('item_id', 'inventoryItems'),
  travel_orders: direct(),
  travel_order_expenses: scope('travel_order_id', 'travelOrders'),
  project_estimates: direct(),
  project_invoices: direct(),
  invoice_reminders: scope('invoice_id', 'projectInvoices'),

  // — Projekti —
  projects: direct(),
  project_milestones: { ...scope('project_id', 'projects'), readFrom: 'project_milestones_scoped' },
  milestone_checklist_items: scope('milestone_id', 'milestones'),
  milestone_budget_alerts: scope('project_id', 'projects'),
  milestone_budget_revisions: scope('project_id', 'projects'),
  project_budget_revisions: scope('project_id', 'projects'),
  project_contract_amendments: scope('project_id', 'projects'),
  project_documents: scope('project_id', 'projects'),
  project_funding: scope('project_id', 'projects'),
  project_members: scope('project_id', 'projects'),
  project_member_permissions: scope('project_id', 'projects'),
  project_invitations: scope('project_id', 'projects', ['token']),
  project_activity_log: scope('project_id', 'projects'),
  project_templates: col('created_by'),
  project_decisions: scope('project_id', 'projects'),
  project_decision_steps: scope('decision_id', 'decisions'),
  project_decision_attachments: scope('decision_id', 'decisions'),
  project_decision_admin_requests: scope('project_id', 'projects'),
  decision_withdrawal_log: scope('project_id', 'projects'),

  // — Ljudi na projektima (korisnikova poslovna evidencija) —
  workers: direct(),
  project_workers: scope('project_id', 'projects'),
  project_worker_rate_history: scope('worker_id', 'workers'),
  project_worker_payouts: scope('project_id', 'projects'),
  payout_rate_segments: scope('payout_id', 'workerPayouts'),
  project_work_entries: scope('project_id', 'projects'),
  project_work_entry_locks: scope('project_id', 'projects'),
  project_work_logs: scope('project_id', 'projects'),
  project_collaborators: scope('project_id', 'projects'),
  project_collaborator_payments: scope('project_id', 'projects'),

  // — Krug —
  krug: scope('id', 'krugs'),
  krug_membership: direct(),
  krug_ownership: direct(),
  krug_income_ratio: direct(),
  krug_expense_split_override: scope('krug_id', 'krugs'),
  krug_expense_split_share: direct(),
  krug_expense_split_confirmation: direct(),
  krug_settlement_ledger: { rule: { via: 'orColumns', columns: ['from_user', 'to_user'] } },
  krug_settlement_fx_snapshot: scope('krug_id', 'krugs'),
  krug_shared_payment_source: scope('krug_id', 'krugs'),
  krug_deletion_request: scope('krug_id', 'krugs'),
  krug_deletion_vote: direct(),
  krug_invitations: scope('krug_id', 'krugs', ['token']),
  krug_membership_audit: excluded(R.others),
  krug_act_dedup: excluded(R.internal),

  // — AI —
  chat_messages: direct(),
  ai_action_log: direct(),
  ai_proposed_actions: direct(),
  ai_insights_cache: excluded(R.derived),
  ai_usage_daily: excluded(R.metering),
  ai_usage_monthly: excluded(R.metering),
  ai_cost_monthly: excluded(R.internal),
  ai_route_costs: excluded(R.internal),

  // — Isključeno: interno, telemetrija, administracija, tajne —
  account_deletion_log: excluded(R.admin),
  activation_nudge_log: excluded(R.internal),
  admin_module_grants: excluded(R.admin),
  app_diagnostics_logs: excluded(R.telemetry),
  app_settings: excluded(R.internal),
  company_lookup_cache: excluded(R.derived),
  core_scan_usage: excluded(R.metering),
  dashboard_telemetry: excluded(R.telemetry),
  email_send_log: excluded(R.internal),
  email_send_state: excluded(R.internal),
  email_unsubscribe_tokens: excluded(R.secrets),
  free_tier_usage_monthly: excluded(R.metering),
  funnel_events: excluded(R.telemetry),
  health_summaries: excluded(R.internal),
  ingest_jobs: excluded(R.internal),
  landing_events: excluded(R.telemetry),
  mail_import_usage_monthly: excluded(R.metering),
  monitor_alerts_log: excluded(R.internal),
  paddle_price_map: excluded(R.internal),
  participant_digest_state: excluded(R.internal),
  pdf_parse_jobs: excluded(R.internal),
  project_activity_push_throttle: excluded(R.internal),
  project_share_links: excluded(R.secrets),
  push_delivery_logs: excluded(R.telemetry),
  push_tokens: excluded(R.secrets),
  suppressed_emails: excluded(R.internal),
  user_login_logs: excluded(R.telemetry),
  user_roles: excluded(R.admin),
  webhook_events: excluded(R.internal),
};

export const EXPORTED_TABLES = Object.keys(EXPORT_REGISTRY).filter(
  (t) => EXPORT_REGISTRY[t].rule.via !== 'excluded',
);

export const EXCLUDED_TABLES = Object.keys(EXPORT_REGISTRY).filter(
  (t) => EXPORT_REGISTRY[t].rule.via === 'excluded',
);
