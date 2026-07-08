// Server-side notification catalog (DE) — SUBSET of src/i18n/locales/de.json.
// Master locale is src/i18n/locales/de.json; this file MUST stay in sync via
// src/i18n/__tests__/serverCatalogSync.test.ts (vitest gate).
//
// Only keys used by DB triggers / edge functions belong here. Adding a key
// here without the same key + same {{placeholders}} in all three master
// locales makes the sync-guard test fail.
export default {
  "notifications.worker_payout.created.single.title":
    "Neue Auszahlung — {{project}}",
  "notifications.worker_payout.created.single.message":
    "Auszahlung {{amount}} für Zeitraum {{period_start}} → {{period_end}} erhalten.",
  "notifications.worker_payout.created.batch.title":
    "Sammelauszahlung — {{count}} Projekte",
  "notifications.worker_payout.created.batch.message":
    "{{amount}} für {{count}} Projekte erhalten ({{project_names}}).",
  "notifications.worker_payout.voided.single.title":
    "Auszahlung storniert — {{project}}",
  "notifications.worker_payout.voided.single.message":
    "Ihre Auszahlung {{amount}} ({{period_start}} → {{period_end}}) wurde storniert.",
  "notifications.worker_payout.voided.batch.title":
    "Sammelauszahlung storniert — {{count}} Projekte",
  "notifications.worker_payout.voided.batch.message":
    "Sammelauszahlung {{amount}} für {{count}} Projekte wurde storniert.",
  "notifications.worker_payout.fallback_project":
    "Projekt",
  "notifications.project_transaction.title":
    "Transaktion im Projekt „{{project}}\"",
  "notifications.project_transaction.message.created.income":
    "{{actor}} hat Einnahme „{{description}}\" ({{amount}}) hinzugefügt",
  "notifications.project_transaction.message.created.expense":
    "{{actor}} hat Ausgabe „{{description}}\" ({{amount}}) hinzugefügt",
  "notifications.project_transaction.message.updated.income":
    "{{actor}} hat Einnahme „{{description}}\" ({{amount}}) aktualisiert",
  "notifications.project_transaction.message.updated.expense":
    "{{actor}} hat Ausgabe „{{description}}\" ({{amount}}) aktualisiert",
  "notifications.payment_source_transaction.title":
    "Transaktion auf Konto „{{source}}\"",
  "notifications.payment_source_transaction.message.created.income":
    "{{actor}} hat Einnahme „{{description}}\" ({{amount}}) hinzugefügt",
  "notifications.payment_source_transaction.message.created.expense":
    "{{actor}} hat Ausgabe „{{description}}\" ({{amount}}) hinzugefügt",
  "notifications.payment_source_transaction.message.created.transfer":
    "{{actor}} hat Überweisung „{{description}}\" ({{amount}}) hinzugefügt",
  "notifications.payment_source_transaction.message.updated.income":
    "{{actor}} hat Einnahme „{{description}}\" ({{amount}}) aktualisiert",
  "notifications.payment_source_transaction.message.updated.expense":
    "{{actor}} hat Ausgabe „{{description}}\" ({{amount}}) aktualisiert",
  "notifications.payment_source_transaction.message.updated.transfer":
    "{{actor}} hat Überweisung „{{description}}\" ({{amount}}) aktualisiert",
  "notifications.pending_transaction.title":
    "Neue ausstehende Transaktion",
  "notifications.pending_transaction.message.income":
    "{{actor}} hat Einnahme „{{description}}\" ({{amount}}) zu Kreis „{{source}}\" hinzugefügt. Wartet auf Ihre Zustimmung.",
  "notifications.pending_transaction.message.expense":
    "{{actor}} hat Ausgabe „{{description}}\" ({{amount}}) zu Kreis „{{source}}\" hinzugefügt. Wartet auf Ihre Zustimmung.",
  "notifications.note_added.project.title":
    "Neuer Kommentar im Projekt „{{project}}\"",
  "notifications.note_added.project.message":
    "{{actor}} hat Transaktion „{{description}}\" kommentiert: „{{note}}\"",
  "notifications.note_added.income_source.title":
    "Neue Notiz zur Transaktion",
  "notifications.note_added.income_source.message":
    "{{actor}} hat eine Notiz zur Transaktion „{{description}}\" im Projekt „{{source}}\" hinzugefügt: „{{note}}\"",
  "notifications.note_added.payment_source.title":
    "Neuer Kommentar auf Konto „{{source}}\"",
  "notifications.note_added.payment_source.message":
    "{{actor}} hat Transaktion „{{description}}\" kommentiert: „{{note}}\"",
  "notifications.project_activity.title":
    "Aktivität im Projekt „{{project}}\"",
  "notifications.project_activity.message.work_log_added":
    "{{actor}} hat einen Arbeitseintrag hinzugefügt{{detail}}",
  "notifications.project_activity.message.work_log_updated":
    "{{actor}} hat einen Arbeitseintrag aktualisiert{{detail}}",
  "notifications.project_activity.message.work_log_deleted":
    "{{actor}} hat einen Arbeitseintrag gelöscht{{detail}}",
  "notifications.project_activity.message.milestone_added":
    "{{actor}} hat Meilenstein „{{milestone}}\" hinzugefügt",
  "notifications.project_activity.message.milestone_status_changed":
    "{{actor}} hat Status des Meilensteins „{{milestone}}\" geändert → {{status}}",
  "notifications.project_activity.message.milestone_deleted":
    "{{actor}} hat Meilenstein „{{milestone}}\" gelöscht",
  "notifications.auto_reject_pending.title":
    "Transaktion automatisch abgelehnt",
  "notifications.auto_reject_pending.message":
    "Ihre Transaktion „{{description}}\" wurde automatisch abgelehnt, weil sie nicht innerhalb von 24 Stunden genehmigt wurde.",
  "notifications.fallback.actor":
    "Mitglied",
  "notifications.fallback.project":
    "Projekt",
} as const;
