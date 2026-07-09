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
  "notifications.activation_nudge.day1.title":
    "Dobrodošao u V&M Balance 👋",
  "notifications.activation_nudge.day1.message":
    "Kreni s prvim projektom — renoviranje, klijent ili osobni cilj.",
  "notifications.activation_nudge.day3.title":
    "Spreman za prvi projekt? 🎯",
  "notifications.activation_nudge.day3.message":
    "Projekti ti pomažu pratiti budžet i troškove na jednom mjestu.",
  "notifications.activation_nudge.day7.title":
    "Iskusi punu snagu V&M Balance 🚀",
  "notifications.activation_nudge.day7.message":
    "Otvori prvi projekt u 30s i drži troškove pod kontrolom.",
  "notifications.app_update.title":
    "Dostupno je ažuriranje aplikacije",
  "notifications.app_update.message":
    "Verzija {{version}} je spremna. Dodirni za preuzimanje i instalaciju.",
  "notifications.budget_burn_push.title":
    "Iskorišteno {{percentage}}% okvira „{{name}}“",
  "notifications.budget_burn_push.message":
    "Stvarno {{spent}} od {{limit}} okvira ovog perioda.",
  "notifications.budget_pace_push.title":
    "Trošenje je ispred tempa perioda",
  "notifications.budget_pace_push.message":
    "„{{name}}“: potrošeno {{spentPct}}% okvira, proteklo {{elapsedPct}}% perioda. Provjeri smjer.",
  "notifications.milestone_budget.warning.title":
    "🟡 Faza „{{name}}\" je na {{percentage}}% budžeta",
  "notifications.milestone_budget.warning.message":
    "Faza „{{name}}\" u projektu „{{project}}\" potrošila je {{percentage}}% planiranog budžeta.",
  "notifications.milestone_budget.over.title":
    "🔴 Faza „{{name}}\" je premašila budžet",
  "notifications.milestone_budget.over.message":
    "Faza „{{name}}\" u projektu „{{project}}\" premašuje budžet za {{overPct}}%. Razmisli o reviziji ili povlačenju iz rezerve.",
  "notifications.milestone_deadline.upcoming.title":
    "⏰ Faza „{{name}}\" ističe za {{days}} dana",
  "notifications.milestone_deadline.upcoming.message":
    "Faza „{{name}}\" u projektu „{{project}}\" ističe {{date}}.",
  "notifications.milestone_deadline.overdue.title":
    "⚠️ Faza „{{name}}\" je istekla",
  "notifications.milestone_deadline.overdue.message":
    "Faza „{{name}}\" u projektu „{{project}}\" je prošla rok za {{days}} dana.",
  "notifications.reminder.fallback_body":
    "Podsjetnik: {{title}}",
  "notifications.participant_digest.title":
    "Sažetak: „{{project}}\"",
  "notifications.participant_digest.body.empty":
    "Nema novih događaja.",
  "notifications.participant_digest.body.single_no_samples":
    "1 nova promjena u projektu",
  "notifications.participant_digest.body.many_no_samples":
    "{{count}} novih promjena u projektu",
  "notifications.participant_digest.body.single_with_samples":
    "1 nova promjena u projektu: {{samples}}",
  "notifications.participant_digest.body.many_with_samples":
    "{{count}} novih promjena u projektu: {{samples}}",
  "notifications.invitation_accepted.title":
    "Pozivnica prihvaćena",
  "notifications.invitation_accepted.message.project":
    "{{userName}} je prihvatio/la pozivnicu za projekt „{{targetName}}\"",
  "notifications.invitation_accepted.message.budget":
    "{{userName}} je prihvatio/la pozivnicu za budžet „{{targetName}}\"",
  "notifications.invitation_accepted.message.payment_source":
    "{{userName}} je prihvatio/la pozivnicu za račun „{{targetName}}\"",
  "notifications.invitation_accepted.push.project":
    "{{userName}} se pridružio/la projektu „{{targetName}}\"",
  "notifications.invitation_accepted.push.budget":
    "{{userName}} se pridružio/la budžetu „{{targetName}}\"",
  "notifications.invitation_accepted.push.payment_source":
    "{{userName}} se pridružio/la računu „{{targetName}}\"",
  "notifications.member_joined.project.title":
    "Novi član projekta",
  "notifications.member_joined.project.message":
    "{{memberName}} se pridružio/la projektu „{{targetName}}\"",
  "notifications.member_joined.budget.title":
    "Novi član budžeta",
  "notifications.member_joined.budget.message":
    "{{memberName}} se pridružio/la budžetu „{{targetName}}\"",
  "notifications.invitation_sent.project.title":
    "Pozivnica za projekt",
  "notifications.invitation_sent.project.message":
    "{{inviterName}} vas poziva da se pridružite projektu „{{targetName}}\"",
  "notifications.invitation_sent.budget.title":
    "Pozivnica za budžet",
  "notifications.invitation_sent.budget.message":
    "{{inviterName}} vas poziva da se pridružite budžetu „{{targetName}}\"",
  "notifications.invitation_sent.payment_source.title":
    "Pozivnica za dijeljeni račun",
  "notifications.invitation_sent.payment_source.message":
    "{{inviterName}} vas poziva da se pridružite računu „{{targetName}}\"",
} as const;
