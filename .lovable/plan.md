# Inventar javnih edge funkcija (`verify_jwt = false`)

Samo popis i procjena. Nijedna izmjena nije predložena niti napravljena.

Napomena o "zadanom": na Lovable Cloudu funkcije bez unosa u `config.toml` deployaju se s `verify_jwt = false`, dakle **jesu javne na razini gatewaya**. Zato su u popisu i one bez unosa.

Legenda: `$` = troši novac (AI/vanjski plaćeni servis, e-mail), `W` = piše u bazu, `D` = vraća podatke o korisnicima.

## A. Legitimno javne (vanjski pozivatelj bez JWT-a)

| Funkcija | Tko zove | Mora biti javna? | Unutarnja provjera | Oznake |
|---|---|---|---|---|
| `bank-connect-complete` | Enable Banking redirect (browser) | Da — bankovni povratni URL | Nema potpisa; radi samo s važećim `state`/session id; HTML escapan, origin sužen | W |
| `paddle-webhook` | Paddle | Da — webhook | HMAC-SHA256 + `webhook_events` idempotencija | W, D (interno) |
| `auth-email-hook` | Supabase Auth | Da — auth hook | Standard Webhooks potpis (`SEND_EMAIL_HOOK_SECRET`) | $ (e-mail), W |
| `handle-email-suppression` | Resend webhook | Da — webhook | Potpis + provjera timestampa | $, W |
| `handle-email-unsubscribe` | Klik u e-mailu (bez sesije) | Da — unsubscribe link | Samo token iz linka | W |
| `get-public-project` | Javni share link | Da — javni pregled | Token + `revoked_at`/`expires_at`; financije uklonjene | D (naziv projekta, faze) |

## B. Cron (pg_cron), gola na razini gatewaya, ali zove ih baza s service-role headerom

Sve navedene rade s `SUPABASE_SERVICE_ROLE_KEY` i **nemaju vlastitu provjeru pozivatelja** — tko pogodi URL, može ih pokrenuti (bez podataka natrag, ali s nuspojavama).

| Funkcija | Raspored | Nuspojava | Oznake |
|---|---|---|---|
| `activation-nudge` | 10:00 dnevno | šalje push/nudge | W |
| `auto-invoice-reminders` | 09:00 dnevno | podsjetnici | W |
| `auto-reject-pending` | svaki sat (dry-run) | odbija pending stavke | W |
| `backup-weekly` | ned 01:00 | generira backup | W |
| `check-milestone-budgets` | 08:00 | alarmi faza | W |
| `check-milestone-deadlines` | 08:00 | alarmi rokova | W |
| `check-reminders` | /15 min | podsjetnici | W |
| `cleanup-krug-deleted` | 03:20 | **briše podatke** | W |
| `cleanup-trash` | 03:15 | **briše podatke** | W |
| `decisions-reminder-tick` | /30 min | podsjetnici | W |
| `monitor-app-health` | /5 min | admin push + e-mail | $, W |
| `process-pending-deletions` | 00:30 | **briše korisničke račune** | W |
| `send-daily-summary` | svaki sat | push + agregacija | W |
| `trial-reminder` | 09:00 | e-mail/AI tekst | $, W |

Iznimke unutar cron skupine koje **imaju** vlastitu provjeru:
- `krug-freeze-fx-snapshot`, `krug-settlement-reminder` — `KRUG_NOTIFY_INTERNAL_KEY` (Bearer / `x-krug-internal-key` / `apikey`), 401 bez njega.
- `flush-participant-digest` — validira JWT kad je pozvana iz aplikacije.

## C. Zove ih naša aplikacija, `verify_jwt = false`, ali imaju `getClaims`/`requireAuth` u kodu

Efektivno zatvorene; javni unos postoji samo zato što se JWT provjerava u kodu, ne na gatewayu.

`check-budget-alerts`, `broadcast-notification`, `notify-note-added`, `notify-pending-transaction`, `notify-project-transaction`, `notify-payment-source-transaction`, `notify-krug-event` (interni ključ), `respond-to-invitation`, `send-member-invitation`, `track-referral`, `parse-receipt` ($, AI), `notify-crash` (JWT opcionalan namjerno + rate-limit po IP hashu).

## D. Zaštićene tajnom (build/release pipeline)

`upload-apk-release`, `publish-version-manifest`, `notify-app-update` — svaka traži vlastiti secret, 401 bez njega. `preview-transactional-email` traži `LOVABLE_API_KEY` u Authorization headeru.

## E. Gole i javne, izvan cron liste — ovdje treba odluka

| Funkcija | Tko zove | Mora li biti javna | Stanje | Oznake |
|---|---|---|---|---|
| `notify-feedback-admin` | naša aplikacija nakon slanja feedbacka | Ne | **Gola.** Bilo tko s `feedbackId` (UUID) izaziva slanje e-maila/webhooka adminu s punim sadržajem feedbacka. Ne vraća podatke pozivatelju. | $, W, D (u e-mailu adminu) |
| `notify-decision-closed` | naša aplikacija / trigger | Ne | Gola, service role, samo push | W |
| `exchange-rates` | naša aplikacija | Ne (ali bezopasna) | Gola; proxy na frankfurter.app s 1h cacheom, bez ključa, bez baze | — |
| `get-paddle-config` | naša aplikacija (Paddle.js) | Praktički da | Vraća `PADDLE_CLIENT_TOKEN` koji je po dizajnu javan | — |
| `mcp` | vanjski MCP klijenti | Da (OAuth resurs) | Auth kroz `@lovable.dev/mcp-js` (`ctx.getToken()`), upiti idu pod korisnikovim JWT-om uz RLS | W, D |
| `send-push` | interni pozivatelji | Ne | Ima provjeru (401 grana) | W |

## F. Potvrda za `lookup-company`

Na popisu je s novim stanjem: `verify_jwt = true` u `config.toml`, uz `getClaims` + kvota u kodu. Više nije javna. Isto vrijedi za `parse-standup` (`verify_jwt = true`, `requireAuth`, sada i pod `checkAiCostCap`).

## Sažetak po traženim oznakama

- **Troše novac:** `auth-email-hook`, `handle-email-suppression`, `monitor-app-health`, `trial-reminder`, `notify-feedback-admin`, `parse-receipt`, `preview-transactional-email`.
- **Pišu u bazu:** sve iz skupine B, plus `bank-connect-complete`, `paddle-webhook`, `handle-email-unsubscribe`, sve iz skupine C, `notify-decision-closed`, `send-push`, `mcp`.
- **Vraćaju podatke o korisnicima pozivatelju:** `get-public-project` (ograničeno, bez financija), `mcp` (pod korisnikovim JWT-om + RLS). Ostale vraćaju samo status.

## Najveći stvarni rizici (bez preporuke za akciju, za odluku)

1. `process-pending-deletions`, `cleanup-trash`, `cleanup-krug-deleted` — gole, a **brišu podatke**. Vanjski poziv ubrzava brisanje mimo rasporeda.
2. `notify-feedback-admin` — gola, troši e-mail kvotu i može spamati admina; sadržaj feedbacka ide u e-mail.
3. `trial-reminder`, `monitor-app-health`, `activation-nudge`, `send-daily-summary` — gole, mogu generirati val push/e-mail poruka korisnicima.
