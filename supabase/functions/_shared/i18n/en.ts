// Server-side notification catalog (EN) — SUBSET of src/i18n/locales/en.json.
// Master locale is src/i18n/locales/en.json; this file MUST stay in sync via
// src/i18n/__tests__/serverCatalogSync.test.ts (vitest gate).
//
// Only keys used by DB triggers / edge functions belong here. Adding a key
// here without the same key + same {{placeholders}} in all three master
// locales makes the sync-guard test fail.
export default {
  "notifications.worker_payout.created.single.title":
    "New payout — {{project}}",
  "notifications.worker_payout.created.single.message":
    "Payout {{amount}} received for period {{period_start}} → {{period_end}}.",
  "notifications.worker_payout.created.batch.title":
    "Batch payout — {{count}} projects",
  "notifications.worker_payout.created.batch.message":
    "Received {{amount}} for {{count}} projects ({{project_names}}).",
  "notifications.worker_payout.voided.single.title":
    "Payout voided — {{project}}",
  "notifications.worker_payout.voided.single.message":
    "Your payout {{amount}} ({{period_start}} → {{period_end}}) was voided.",
  "notifications.worker_payout.voided.batch.title":
    "Batch payout voided — {{count}} projects",
  "notifications.worker_payout.voided.batch.message":
    "Batch payout {{amount}} for {{count}} projects was voided.",
  "notifications.worker_payout.fallback_project":
    "project",
  "notifications.project_transaction.title":
    "Transaction in project „{{project}}\"",
  "notifications.project_transaction.message.created.income":
    "{{actor}} added income „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.created.expense":
    "{{actor}} added expense „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.updated.income":
    "{{actor}} updated income „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.updated.expense":
    "{{actor}} updated expense „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.title":
    "Transaction on account „{{source}}\"",
  "notifications.payment_source_transaction.message.created.income":
    "{{actor}} added income „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.created.expense":
    "{{actor}} added expense „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.created.transfer":
    "{{actor}} added transfer „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.income":
    "{{actor}} updated income „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.expense":
    "{{actor}} updated expense „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.transfer":
    "{{actor}} updated transfer „{{description}}\" ({{amount}})",
  "notifications.pending_transaction.title":
    "New pending transaction",
  "notifications.pending_transaction.message.income":
    "{{actor}} added income „{{description}}\" ({{amount}}) to circle „{{source}}\". Awaiting your approval.",
  "notifications.pending_transaction.message.expense":
    "{{actor}} added expense „{{description}}\" ({{amount}}) to circle „{{source}}\". Awaiting your approval.",
  "notifications.note_added.project.title":
    "New comment in project „{{project}}\"",
  "notifications.note_added.project.message":
    "{{actor}} commented on transaction „{{description}}\": „{{note}}\"",
  "notifications.note_added.income_source.title":
    "New note on transaction",
  "notifications.note_added.income_source.message":
    "{{actor}} added a note to transaction „{{description}}\" in project „{{source}}\": „{{note}}\"",
  "notifications.note_added.payment_source.title":
    "New comment on account „{{source}}\"",
  "notifications.note_added.payment_source.message":
    "{{actor}} commented on transaction „{{description}}\": „{{note}}\"",
  "notifications.project_activity.title":
    "Activity in project „{{project}}\"",
  "notifications.project_activity.message.work_log_added":
    "{{actor}} added a work log{{detail}}",
  "notifications.project_activity.message.work_log_updated":
    "{{actor}} updated a work log{{detail}}",
  "notifications.project_activity.message.work_log_deleted":
    "{{actor}} deleted a work log{{detail}}",
  "notifications.project_activity.message.milestone_added":
    "{{actor}} added milestone „{{milestone}}\"",
  "notifications.project_activity.message.milestone_status_changed":
    "{{actor}} changed milestone „{{milestone}}\" status → {{status}}",
  "notifications.project_activity.message.milestone_deleted":
    "{{actor}} deleted milestone „{{milestone}}\"",
  "notifications.auto_reject_pending.title":
    "Transaction auto-rejected",
  "notifications.auto_reject_pending.message":
    "Your transaction „{{description}}\" was auto-rejected because it was not approved within 24 hours.",
  "notifications.fallback.actor":
    "Member",
  "notifications.fallback.project":
    "project",
} as const;
