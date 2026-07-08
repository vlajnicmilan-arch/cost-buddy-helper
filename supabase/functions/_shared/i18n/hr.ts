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
  "notifications.worker_payout.fallback_project": "projekt",
} as const;
