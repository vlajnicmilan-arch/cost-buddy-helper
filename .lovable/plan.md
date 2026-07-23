# Audit konfiguracijskog drifta — read-only

**Nema izmjena. Samo nalazi.**

---

## 1. Edge funkcije: repo vs `config.toml`

Ukupno 75 direktorija (bez `_shared`), 45 `[functions.*]` blokova. Preklapa se 43.

### U repo, NEMA config bloka (32) → vozе se s Lovable defaultima
```
accept-project-invitation, activation-nudge, admin-hard-delete-user,
admin-manage-user, auto-invoice-reminders, backup-weekly, bank-connect-start,
bank-link-account, bank-list-aspsps, bank-sync-transactions,
check-milestone-budgets, check-milestone-deadlines, check-reminders,
check-subscription, cleanup-krug-deleted, cleanup-trash,
decisions-reminder-tick, exchange-rates, financial-assistant,
generate-ai-insights, generate-health-summary, get-paddle-config,
krug-add-member, list-users, mcp, monitor-app-health, notify-decision-closed,
notify-project-activity, notify-worker-payout, parse-pdf-statement,
save-push-token, send-push
```

### U `config.toml`, NEMA direktorij (2) → mrtvi blokovi
- `accept-invitation` (postoji `accept-project-invitation` — vjerojatno preimenovano; blok je zaostatak)
- `eracuni-proxy` (nema direktorija — ili nikad dodano, ili obrisano)

---

## 2. Env varijable — grupacija

**Broadly used (očekivano):**
- `SUPABASE_URL` (65), `SUPABASE_SERVICE_ROLE_KEY` (63), `SUPABASE_ANON_KEY` (28), `LOVABLE_API_KEY` (17)

**Single-use varijable — svaka legitimno vezana za svoju funkciju (nema drifta):**

| Var | Jedini korisnik |
|---|---|
| `ALLOW_HARD_DELETE` | admin-hard-delete-user |
| `FCM_SERVICE_ACCOUNT` | send-push |
| `FEEDBACK_ADMIN_EMAIL` | notify-feedback-admin |
| `FEEDBACK_WEBHOOK_URL` | notify-feedback-admin |
| `KRUG_NOTIFY_INTERNAL_KEY` | notify-krug-event |
| `LOVABLE_SEND_URL` | process-email-queue |
| `PADDLE_API_KEY` | paddle-portal-url |
| `PADDLE_CLIENT_TOKEN` | get-paddle-config |
| `PADDLE_WEBHOOK_SECRET` | paddle-webhook |

**Grupirano (potencijalni drift kandidati — različite funkcije, ista domena):**
- `PADDLE_ENV` — `get-paddle-config`, `paddle-portal-url` (ali NE `paddle-webhook` — webhook ne treba env indikator jer secret sam po sebi razlikuje sandbox/live; nije drift, samo dizajn)
- `APK_UPLOAD_TOKEN` — `upload-apk-release`, `publish-version-manifest`, `notify-app-update` (konzistentno)
- `PUBLIC_APP_URL` — `monitor-app-health`, `notify-crash`, `notify-feedback-admin` (konzistentno)

**Nalaz:** Nema opasnog drifta u env varijablama.

---

## 3. `verify_jwt` konzistentnost

### `verify_jwt=true` ALI **nema internog `getClaims`/`getUser` poziva** (9) — potencijalni rizik ako framework auth zakaže
```
analyze-document, categorize-transaction, detect-loans, match-recurring,
parse-standup, process-email-queue, project-insights, scan-card,
send-transactional-email
```
Ove funkcije oslanjaju se isključivo na platformski JWT gate. Ako se `verify_jwt` slučajno prebaci na `false` (npr. mass-refactor), postaju otvorene bez internih zaštita. **Preporuka za razmatranje:** defense-in-depth `getClaims()` provjera i u ovima.

### `verify_jwt=true` + interno validira (5) — dvostruka zaštita (OK)
```
cancel-account-deletion, confirm-ai-action, paddle-portal-url,
request-account-deletion, run-security-audit
```

### `verify_jwt=false` + interno validira (13) — Lovable signing-keys pattern (OK)
```
broadcast-notification, check-budget-alerts, flush-participant-digest,
lookup-company, notify-crash, notify-note-added,
notify-payment-source-transaction, notify-pending-transaction,
notify-project-transaction, parse-receipt, respond-to-invitation,
send-member-invitation, track-referral
```

### `verify_jwt=false` + **nema internog checka** (18) — namjerno javno; provjeri je li opravdano za svaku
```
accept-invitation (mrtav blok!), auth-email-hook, auto-reject-pending,
bank-connect-complete, eracuni-proxy (mrtav blok!), get-public-project,
handle-email-suppression, handle-email-unsubscribe, notify-app-update,
notify-feedback-admin, notify-krug-event, paddle-webhook,
preview-transactional-email, process-pending-deletions,
publish-version-manifest, send-daily-summary, trial-reminder,
upload-apk-release
```
Kritični za dodatni pregled: `notify-feedback-admin`, `notify-krug-event`, `notify-app-update`, `preview-transactional-email` (imaju li vlastite tajne/allow-liste?). Cron-only funkcije (`auto-reject-pending`, `process-pending-deletions`, `send-daily-summary`, `trial-reminder`) su OK ako imaju cron shared-secret ili unutarnju gate.

### Bez config bloka + interno validira (17) — nasljeđuju Lovable default (`verify_jwt=false` na signing-keys)
```
accept-project-invitation, admin-hard-delete-user, admin-manage-user,
bank-connect-start, bank-link-account, bank-list-aspsps,
bank-sync-transactions, check-subscription, financial-assistant,
generate-ai-insights, generate-health-summary, krug-add-member, list-users,
notify-project-activity, notify-worker-payout, parse-pdf-statement,
save-push-token
```
Rade jer sve one interno pozivaju `getClaims`. **Nalaz:** eksplicitni `verify_jwt` u config.toml bi bio konzistentniji, ali funkcionalno OK.

---

## 4. Cron zadaci — kandidati bez schedule-a

19 aktivnih cron jobova u `cron.job`. Cron pokriva:
```
activation-nudge, auto-invoice-reminders, backup-weekly,
check-milestone-budgets, check-milestone-deadlines, check-reminders,
cleanup-krug-deleted, cleanup-trash, decisions-reminder-tick,
flush-participant-digest, monitor-app-health, process-pending-deletions,
send-daily-summary, trial-reminder
+ interni SQL: cleanup-diagnostic-logs, cleanup-stale-push-tokens-weekly,
              krug-cleanup-act-dedup, krug-expire-predlozena, purge-funnel-events-monthly
```

### Cron-tipske funkcije BEZ schedule-a (4)
| Funkcija | Nalaz |
|---|---|
| `auto-reject-pending` | `verify_jwt=false`, izgleda kao periodični job — nema cron ni internog trigera |
| `check-budget-alerts` | isto — periodični handler bez schedule-a |
| `exchange-rates` | ECB rates — vjerojatno treba dnevni cron |
| `match-recurring` | recurring transaction matcher — vjerojatno treba dnevni/satni cron |

Sve četiri se izvršavaju samo ako ih netko iz aplikacije ili ručno pozove. **Rizik: podaci koji ovise o njima mogu biti stali.**

---

## 5. TEMPORARY / TODO / FIXME s action itemom

Samo dva stvarna markera:

1. `supabase/config.toml:61` — `# TEMPORARY AUDIT TOOL — delete this block after verdict` → `[functions.run-security-audit]`
2. `supabase/functions/run-security-audit/index.ts:1` — `// TEMPORARY AUDIT TOOL — delete after verdict`

Obje se odnose na `run-security-audit` funkciju koja je bila privremeno postavljena za sigurnosnu reviziju i još nije uklonjena. Action item je jasan: obrisati funkciju + config blok nakon što je audit gotov.

Nema drugih TODO/FIXME s action itemima u `supabase/config.toml` ili `supabase/functions/**` (osim `_shared/`).

---

## Sažetak prioriteta (za tvoju odluku)

1. **Mrtvi blokovi u config.toml**: `accept-invitation`, `eracuni-proxy` — obrisati.
2. **`run-security-audit` privremeni marker** — audit je proveden više puta; vrijeme da se odluči briše li se.
3. **Cron gap**: `exchange-rates`, `match-recurring`, `auto-reject-pending`, `check-budget-alerts` — potvrditi zašto nemaju schedule.
4. **9 funkcija s `verify_jwt=true` bez internog checka** — razmotriti defense-in-depth.
5. **17 funkcija bez config bloka** — dodati eksplicitne `[functions.*]` blokove radi čitljivosti (nije funkcionalni bug).

**Ništa nije mijenjano.** Ako želiš da bilo koji od ovih nalaza pretvorim u konkretan popravak, reci koji i skidamo se u build.
