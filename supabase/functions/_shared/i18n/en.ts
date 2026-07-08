// Server-side notification catalog (EN) — SUBSET of src/i18n/locales/en.json.
// See hr.ts for policy.
export default {
  "notifications.worker_payout.created.single.title":
    "New payout — {{project}}",
  "notifications.worker_payout.created.single.message":
    "Received payout {{amount}} for period {{period_start}} → {{period_end}}.",
  "notifications.worker_payout.created.batch.title":
    "Batch payout — {{count}} projects",
  "notifications.worker_payout.created.batch.message":
    "Received {{amount}} for {{count}} projects ({{project_names}}).",
  "notifications.worker_payout.voided.single.title":
    "Payout voided — {{project}}",
  "notifications.worker_payout.voided.single.message":
    "Your payout {{amount}} ({{period_start}} → {{period_end}}) has been voided.",
  "notifications.worker_payout.voided.batch.title":
    "Batch payout voided — {{count}} projects",
  "notifications.worker_payout.voided.batch.message":
    "Batch payout {{amount}} for {{count}} projects has been voided.",
  "notifications.worker_payout.fallback_project": "project",
} as const;
