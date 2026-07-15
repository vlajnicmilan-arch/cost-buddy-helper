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
  "notifications.activation_nudge.day1.title":
    "Willkommen bei Centar 👋",
  "notifications.activation_nudge.day1.message":
    "Starte mit deinem ersten Projekt — Renovierung, Kunde oder persönliches Ziel.",
  "notifications.activation_nudge.day3.title":
    "Bereit für dein erstes Projekt? 🎯",
  "notifications.activation_nudge.day3.message":
    "Projekte helfen dir, Budget und Ausgaben an einem Ort zu verfolgen.",
  "notifications.activation_nudge.day7.title":
    "Entdecke die volle Power von Centar 🚀",
  "notifications.activation_nudge.day7.message":
    "Erstelle dein erstes Projekt in 30s und behalte Ausgaben im Griff.",
  "notifications.app_update.title":
    "App-Update verfügbar",
  "notifications.app_update.message":
    "Version {{version}} ist bereit. Tippen Sie zum Herunterladen und Installieren.",
  "notifications.budget_burn_push.title":
    "{{percentage}}% des Rahmens „{{name}}“ verwendet",
  "notifications.budget_burn_push.message":
    "Tatsächlich {{spent}} von {{limit}} Rahmen in dieser Periode.",
  "notifications.budget_pace_push.title":
    "Ausgaben liegen vor dem Zeitplan",
  "notifications.budget_pace_push.message":
    "„{{name}}“: {{spentPct}}% des Rahmens ausgegeben, {{elapsedPct}}% der Periode vergangen. Richtung prüfen.",
  "notifications.milestone_budget.warning.title":
    "🟡 Phase „{{name}}\" ist bei {{percentage}}% des Budgets",
  "notifications.milestone_budget.warning.message":
    "Phase „{{name}}\" im Projekt „{{project}}\" hat {{percentage}}% des geplanten Budgets verbraucht.",
  "notifications.milestone_budget.over.title":
    "🔴 Phase „{{name}}\" hat das Budget überschritten",
  "notifications.milestone_budget.over.message":
    "Phase „{{name}}\" im Projekt „{{project}}\" überschreitet das Budget um {{overPct}}%. Erwäge eine Überarbeitung oder Rücklagenentnahme.",
  "notifications.milestone_deadline.upcoming.title":
    "⏰ Phase „{{name}}\" ist in {{days}} Tagen fällig",
  "notifications.milestone_deadline.upcoming.message":
    "Phase „{{name}}\" im Projekt „{{project}}\" ist am {{date}} fällig.",
  "notifications.milestone_deadline.overdue.title":
    "⚠️ Phase „{{name}}\" ist überfällig",
  "notifications.milestone_deadline.overdue.message":
    "Phase „{{name}}\" im Projekt „{{project}}\" ist seit {{days}} Tagen überfällig.",
  "notifications.reminder.fallback_body":
    "Erinnerung: {{title}}",
  "notifications.participant_digest.title":
    "Zusammenfassung: „{{project}}\"",
  "notifications.participant_digest.body.empty":
    "Keine neuen Ereignisse.",
  "notifications.participant_digest.body.single_no_samples":
    "1 neue Änderung im Projekt",
  "notifications.participant_digest.body.many_no_samples":
    "{{count}} neue Änderungen im Projekt",
  "notifications.participant_digest.body.single_with_samples":
    "1 neue Änderung im Projekt: {{samples}}",
  "notifications.participant_digest.body.many_with_samples":
    "{{count}} neue Änderungen im Projekt: {{samples}}",
  "notifications.invitation_accepted.title":
    "Einladung angenommen",
  "notifications.invitation_accepted.message.project":
    "{{userName}} hat die Einladung zum Projekt „{{targetName}}\" angenommen",
  "notifications.invitation_accepted.message.budget":
    "{{userName}} hat die Einladung zum Budget „{{targetName}}\" angenommen",
  "notifications.invitation_accepted.message.payment_source":
    "{{userName}} hat die Einladung zum Konto „{{targetName}}\" angenommen",
  "notifications.invitation_accepted.push.project":
    "{{userName}} ist dem Projekt „{{targetName}}\" beigetreten",
  "notifications.invitation_accepted.push.budget":
    "{{userName}} ist dem Budget „{{targetName}}\" beigetreten",
  "notifications.invitation_accepted.push.payment_source":
    "{{userName}} ist dem Konto „{{targetName}}\" beigetreten",
  "notifications.member_joined.project.title":
    "Neues Projektmitglied",
  "notifications.member_joined.project.message":
    "{{memberName}} ist dem Projekt „{{targetName}}\" beigetreten",
  "notifications.member_joined.budget.title":
    "Neues Budgetmitglied",
  "notifications.member_joined.budget.message":
    "{{memberName}} ist dem Budget „{{targetName}}\" beigetreten",
  "notifications.invitation_sent.project.title":
    "Projekt-Einladung",
  "notifications.invitation_sent.project.message":
    "{{inviterName}} lädt Sie ein, dem Projekt „{{targetName}}\" beizutreten",
  "notifications.invitation_sent.budget.title":
    "Budget-Einladung",
  "notifications.invitation_sent.budget.message":
    "{{inviterName}} lädt Sie ein, dem Budget „{{targetName}}\" beizutreten",
  "notifications.invitation_sent.payment_source.title":
    "Einladung zum geteilten Konto",
  "notifications.invitation_sent.payment_source.message":
    "{{inviterName}} lädt Sie ein, dem Konto „{{targetName}}\" beizutreten",
  "notifications.krug.member_added.title": "Du wurdest zu einem Krug hinzugefügt",
  "notifications.krug.member_added.message": "Du bist jetzt Mitglied eines neuen Krug.",
  "notifications.krug.expense_proposed.title": "Neuer Krug-Vorschlag",
  "notifications.krug.expense_proposed.message": "Eine Transaktion wartet auf deine Freigabe.",
  "notifications.krug.expense_confirmed.title": "Dein Vorschlag wurde bestätigt",
  "notifications.krug.expense_confirmed.message": "Ein Krug-Mitglied hat deinen Vorschlag bestätigt.",
  "notifications.krug.expense_rejected.title": "Dein Vorschlag wurde abgelehnt",
  "notifications.krug.expense_rejected.message": "Ein Krug-Mitglied hat deinen Vorschlag abgelehnt.",
  "notifications.krug.deletion_requested.title": "Krug-Löschung gestartet",
  "notifications.krug.deletion_requested.message": "Der Eigentümer hat die Löschung des Krug angefordert.",
  "notifications.krug.deleted.title": "Krug wurde gelöscht",
  "notifications.krug.deleted.message": "Ein Krug, in dem du Mitglied warst, wurde endgültig entfernt.",
  "notifications.decisions.first_reminder.title": "Entscheidung wartet auf deine Antwort",
  "notifications.decisions.first_reminder.body": "„{{title}}\" wartet seit 12 Stunden auf deine Antwort.",
  "notifications.decisions.overdue.title": "Antwortfrist ist abgelaufen",
  "notifications.decisions.overdue.body": "Entscheidung „{{title}}\" — die 24‑Stunden‑Frist ist abgelaufen.",
  "notifications.decisions.daily.title": "Entscheidung wartet weiterhin auf eine Antwort",
  "notifications.decisions.daily.body": "„{{title}}\" — bitte antworte.",
} as const;
