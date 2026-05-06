---
name: Crash Email Alerts
description: Sustav koji adminima šalje email kad se aplikacija sruši; Sentry uvijek aktivan kao essential monitoring
type: feature
---

# Crash detekcija + email alerti

## Tri kanala (svaki neovisan):

1. **Sentry** (`src/lib/sentry.ts`) — UVIJEK inicijalizira osim u `development`. NIJE više consent-gated. Pravna osnova: legitimni interes (GDPR čl. 6(1)(f)). Konfiguracija: `sendDefaultPii: false`, no replay, no tracing, query strip.

2. **Instant email iz ErrorBoundary-a** (`src/lib/notifyCrash.ts` → `notify-crash` edge funkcija):
   - `ErrorBoundary.componentDidCatch` poziva `notifyCrash({source:'error_boundary',...})`
   - Edge funkcija (verify_jwt=false, keepalive fetch) provjeri dedup u `monitor_alerts_log` (60 min po signature), insertira alert, dohvati admin email-ove preko `user_roles` + `auth.admin.getUserById`, enqueue-a `crash-alert` template kroz `transactional_emails` queue.
   - Idempotencyy key: `crash-<signature>-<adminId>-<hourBucket>` — isti signature ne ide više puta unutar sata.

3. **Cron monitor-app-health** (svakih 5 min):
   - Skenira `app_diagnostics_logs` za `window_error|unhandled_rejection|react_error_boundary`
   - **`react_error_boundary` = instant trigger** (1 event dovoljan)
   - Ostali eventi: postojeći threshold (≥10 errora ili ≥3 usera u 5 min)
   - Šalje I push I email, oba odvojeno tracked u `monitor_alerts_log.notified` / `notified_email`

## Shared helper
`supabase/functions/_shared/sendCrashAlert.ts` — `getAdminEmails()` + `enqueueCrashAlertEmail()`. Koriste ga oba (`notify-crash` i `monitor-app-health`).

## Email template
`supabase/functions/_shared/transactional-email-templates/crash-alert.tsx` — registriran kao `'crash-alert'` u registry.ts. Polja: occurredAt, source, message, stack, componentStack, route, userId, userEmail, appVersion, platform, signature, errorCount, affectedUsers, adminUrl.

## DB
`monitor_alerts_log` proširen kolonama:
- `notified_email BOOLEAN DEFAULT false`
- `source TEXT DEFAULT 'cron'` (cron | error_boundary | window_error)

## Što NE radimo
- Ne diramo `send-transactional-email` — ostaje jedan entry point za client-side trigere
- Ne brišemo push kanal — oba paralelno
- Sentry više NIJE u consent kategoriji "analytics"
