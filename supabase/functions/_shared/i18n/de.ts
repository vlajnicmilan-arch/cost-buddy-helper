// Server-side notification catalog (DE) — SUBSET of src/i18n/locales/de.json.
// See hr.ts for policy.
export default {
  "notifications.worker_payout.created.single.title":
    "Neue Auszahlung — {{project}}",
  "notifications.worker_payout.created.single.message":
    "Auszahlung {{amount}} für den Zeitraum {{period_start}} → {{period_end}} erhalten.",
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
  "notifications.worker_payout.fallback_project": "Projekt",
} as const;
