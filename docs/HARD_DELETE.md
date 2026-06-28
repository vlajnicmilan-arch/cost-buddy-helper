# Hard Delete Foundation

Status: **foundation only** — no admin entrypoint, no UI, no user-facing flow change.

This document is the contract for "fully delete a user and all their data" in V&M Balance. Any code path that deletes a user MUST route through the shared engine described here.

## 1. Files

| Path | Purpose |
|---|---|
| `supabase/functions/_shared/tablesToPurge.ts` | Canonical, categorized inventory. Single source of truth. |
| `supabase/functions/_shared/purgeUser.ts` | Engine. Phases 0–7. |
| `supabase/functions/_shared/purgeUser.types.ts` | `PurgePolicy`, `PurgeResult`, `ResidualScanReport`. |
| `supabase/functions/_shared/__tests__/purgeUser.coverage.test.ts` | Drift guard — fails when a public table is uncategorized. |
| `supabase/functions/process-pending-deletions/index.ts` | Cron caller (30-day grace). Thin wrapper. |

## 2. What the engine deletes

### By `user_id` (Phase 2)
60 tables. See `PURGE_BY_USER_ID` in `tablesToPurge.ts`. Ordered so dependent rows precede parents.

### By email (Phase 3)
6 invitation / suppression tables: `budget_invitations`, `payment_source_invitations`, `project_invitations`, `income_source_invitations`, `email_unsubscribe_tokens`, `suppressed_emails`. Without this step, zombie invitations re-attach memberships when a new account uses the same email.

### Dependent rows (Phase 1)
18 tables joined to the user via `expense_id`, `invoice_id`, `travel_order_id`, `budget_id`, `project_id`, `krug_id`, `created_by`, `generated_by`, or `referrer_or_referred`. Always run BEFORE the corresponding parent in Phase 2.

### Storage (Phase 4)
Buckets with per-user prefix `{userId}/`:

- `receipts`
- `certificates`
- `project-documents`
- `invoice-pdfs`

`public-assets` and `email-assets` are system buckets (no user prefix) and intentionally excluded.

### External (Phase 5)
Active Stripe subscriptions cancelled by email. Skipped if `STRIPE_SECRET_KEY` is absent or `policy.cancelStripeSubscription === false`.

### Auth (Phase 6)
`auth.admin.deleteUser(userId)`. There are zero foreign keys from `public` to `auth.users`, so this step does NOT cascade — Phases 1–3 are the only thing keeping the database clean.

## 3. What stays (intentionally)

| Table | Reason |
|---|---|
| `account_deletion_log` | GDPR audit, 90 days. `user_email` is anonymized in-place. |
| `admin_module_grants` | Admin action audit (`granted_by`/`revoked_by` trail). |
| `subscription_migration_log` | Financial migration audit. |
| `lifetime_purchases` | Financial record. Only purged when `policy.deletePaidRecords === true`. |
| `email_send_log` | Outbound delivery audit. |
| `email_send_state` | System delivery state. |
| `monitor_alerts_log` | System monitoring. |
| `app_settings` | Global config. |

Operational audit (`bug_reports`, `support_tickets`, `feedback_submissions`, `dpa_requests`) IS deleted — they contain personal data. An anonymize-instead option belongs in the future admin layer, not here.

## 4. Guards (Phase 0)

### Krug multi-member protection

If the user owns any `krug` row that still has `krug_membership` entries for OTHER users, the engine returns:

```json
{ "ok": false, "blockedBy": "krug_multi_member", "blockedDetails": { "krugIds": ["…"] } }
```

No deletion happens. The cron logs the row as `status: blocked`. The user's record stays in `account_deletion_log` until a human resolves the krug. The future admin entrypoint can pass `policy.allowKrugDestruction: true` to override deliberately.

### Paid records protection

If `lifetime_purchases` has any rows for the user and `policy.deletePaidRecords !== true`, the engine returns `blockedBy: "paid_records_present"`. Cron stays conservative; admin can override.

## 5. Residual scan (Phase 7)

After Phases 1–6, the engine re-queries every table in `PURGE_BY_USER_ID` and every email-keyed table for leftover rows. Any non-zero result is captured in `result.residualScan` and:

1. The audit row status becomes `completed_with_residuals` instead of `completed`.
2. A `hard_delete_residual` warning is inserted into `app_diagnostics_logs` with the full residual map.

Residual scan is intentionally read-only — it diagnoses, it never deletes silently. A non-zero residual means either a categorization gap in `tablesToPurge.ts` or a delete that errored mid-run; both require investigation.

## 6. Extending the inventory

When a migration adds a new table:

1. Add it to one of: `PURGE_BY_USER_ID`, `PURGE_BY_EMAIL`, `PURGE_DEPENDENT`, `INTENTIONALLY_KEPT`, `NON_USER_TABLES`, `PAID_RECORDS_TABLES`.
2. Update the `PUBLIC_TABLES_SNAPSHOT` in `purgeUser.coverage.test.ts`.
3. Run `deno test supabase/functions/_shared/__tests__/`.

The coverage test fails fast if a new table is left uncategorized. Drift cannot happen silently.

## 7. Why no admin entrypoint in this pass

Two reasons:

1. **Cron is the production canary.** The same engine is exercised every day by the 30-day cron. We want residual reports from real grace-deletions to surface any gap BEFORE we expose a one-click admin button.
2. **Risk asymmetry.** A bug in the cron loses one deferred deletion. A bug in an admin button can be triggered repeatedly against any user. The admin layer is a thin wrapper (`policy: { sourceTag: 'admin_hard_delete', allowKrugDestruction: true, deletePaidRecords: true }` + email allowlist guard) and arrives in a later pass.

## 8. Calling the engine

```ts
import { purgeUser } from "../_shared/purgeUser.ts";

const result = await purgeUser(admin, {
  userId,
  userEmail,
  policy: {
    sourceTag: "cron_grace",
    allowKrugDestruction: false,
    deletePaidRecords: false,
    cancelStripeSubscription: true,
  },
});

if (result.blockedBy) { /* surface to caller, do NOT retry blindly */ }
if (result.residualScan.total > 0) { /* investigate */ }
```
