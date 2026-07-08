// Server-side notification catalog (HR) — SUBSET of src/i18n/locales/hr.json.
// Master locale is src/i18n/locales/hr.json; this file MUST stay in sync via
// src/i18n/__tests__/serverCatalogSync.test.ts (vitest gate).
//
// Only keys used by DB triggers / edge functions belong here. Adding a key
// here without the same key + same {{placeholders}} in all three master
// locales makes the sync-guard test fail.
export default {
  "notifications.worker_payout.created.single.title":
    "Nova isplata — {{project}}",
  "notifications.worker_payout.created.single.message":
    "Zaprimljena isplata {{amount}} za period {{period_start}} → {{period_end}}.",
  "notifications.worker_payout.created.batch.title":
    "Zbirna isplata — {{count}} projekta",
  "notifications.worker_payout.created.batch.message":
    "Zaprimljeno {{amount}} za {{count}} projekata ({{project_names}}).",
  "notifications.worker_payout.voided.single.title":
    "Isplata poništena — {{project}}",
  "notifications.worker_payout.voided.single.message":
    "Vaša isplata {{amount}} ({{period_start}} → {{period_end}}) je poništena.",
  "notifications.worker_payout.voided.batch.title":
    "Zbirna isplata poništena — {{count}} projekta",
  "notifications.worker_payout.voided.batch.message":
    "Zbirna isplata {{amount}} za {{count}} projekata je poništena.",
  "notifications.worker_payout.fallback_project":
    "projekt",
  "notifications.project_transaction.title":
    "Transakcija u projektu „{{project}}\"",
  "notifications.project_transaction.message.created.income":
    "{{actor}} je dodao/la prihod „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.created.expense":
    "{{actor}} je dodao/la trošak „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.updated.income":
    "{{actor}} je ažurirao/la prihod „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.updated.expense":
    "{{actor}} je ažurirao/la trošak „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.title":
    "Transakcija na računu „{{source}}\"",
  "notifications.payment_source_transaction.message.created.income":
    "{{actor}} je dodao/la prihod „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.created.expense":
    "{{actor}} je dodao/la trošak „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.created.transfer":
    "{{actor}} je dodao/la prijenos „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.income":
    "{{actor}} je ažurirao/la prihod „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.expense":
    "{{actor}} je ažurirao/la trošak „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.transfer":
    "{{actor}} je ažurirao/la prijenos „{{description}}\" ({{amount}})",
  "notifications.pending_transaction.title":
    "Nova transakcija na čekanju",
  "notifications.pending_transaction.message.income":
    "{{actor}} je dodao prihod „{{description}}\" ({{amount}}) u krug „{{source}}\". Čeka vaše odobrenje.",
  "notifications.pending_transaction.message.expense":
    "{{actor}} je dodao trošak „{{description}}\" ({{amount}}) u krug „{{source}}\". Čeka vaše odobrenje.",
  "notifications.note_added.project.title":
    "Novi komentar u projektu „{{project}}\"",
  "notifications.note_added.project.message":
    "{{actor}} je komentirao transakciju „{{description}}\": „{{note}}\"",
  "notifications.note_added.income_source.title":
    "Nova napomena na transakciji",
  "notifications.note_added.income_source.message":
    "{{actor}} je dodao napomenu uz transakciju „{{description}}\" u projektu „{{source}}\": „{{note}}\"",
  "notifications.note_added.payment_source.title":
    "Novi komentar na računu „{{source}}\"",
  "notifications.note_added.payment_source.message":
    "{{actor}} je komentirao transakciju „{{description}}\": „{{note}}\"",
  "notifications.project_activity.title":
    "Aktivnost u projektu „{{project}}\"",
  "notifications.project_activity.message.work_log_added":
    "{{actor}} je upisao/la dnevnik{{detail}}",
  "notifications.project_activity.message.work_log_updated":
    "{{actor}} je ažurirao/la dnevnik{{detail}}",
  "notifications.project_activity.message.work_log_deleted":
    "{{actor}} je obrisao/la dnevnik{{detail}}",
  "notifications.project_activity.message.milestone_added":
    "{{actor}} je dodao/la fazu „{{milestone}}\"",
  "notifications.project_activity.message.milestone_status_changed":
    "{{actor}} je promijenio/la status faze „{{milestone}}\" → {{status}}",
  "notifications.project_activity.message.milestone_deleted":
    "{{actor}} je obrisao/la fazu „{{milestone}}\"",
  "notifications.auto_reject_pending.title":
    "Transakcija automatski odbijena",
  "notifications.auto_reject_pending.message":
    "Vaša transakcija „{{description}}\" je automatski odbijena jer nije odobrena u roku od 24 sata.",
  "notifications.fallback.actor":
    "Član",
  "notifications.fallback.project":
    "projekt",
} as const;
