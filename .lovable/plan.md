# Plan: Pouzdano hvatanje crash-eva + email notifikacije

## Cilj
Kad se aplikacija sruši (kod jednog ili više korisnika), admin **odmah dobije email** sa stack traceom, a Sentry **uvijek hvata** technical greške bez čekanja na cookie consent.

---

## 1. Email crash alert template + slanje (NOVO)

**Novi template:** `supabase/functions/_shared/transactional-email-templates/crash-alert.tsx`
- Teal branding (HSL 172 66% 40%), white body
- Polja: vrijeme, user_id (ili "anoniman"), route, message, stack preview (max 1500 chars), app_version, platform, signature, link na Pulse admin
- Subject: `🔴 V&M Balance crash: <message first line>`
- Registrirati u `_shared/transactional-email-templates/registry.ts` kao `crash-alert`

**Slanje koristi postojeći `send-transactional-email`** (jedna funkcija za sve, prema pravilu). Pošiljaoc dohvaća admin email-ove iz `auth.users` (preko `user_roles` join-a) — service role.

---

## 2. Proširenje `monitor-app-health` (cron + email kanal)

Datoteka: `supabase/functions/monitor-app-health/index.ts`

**Promjene:**
- Dodati `react_error_boundary` u `.in("event", [...])` listu skeniranih eventa
- **Snižena pravila za `react_error_boundary`:** svaki **potvrđeni React crash = alert odmah** (1 event dovoljan), s dedup-om 60 min po signature (umjesto 30)
- Postojeći threshold (≥10 errora ili ≥3 usera) ostaje za `window_error`/`unhandled_rejection`
- Za svaki triggered alert: paralelno push **i** email
- Iterirati admin user-e, dohvatiti im email iz `auth.users`, za svakog pozvati `send-transactional-email` s `templateName: 'crash-alert'`, `idempotencyKey: \`crash-${alertId}-${adminUserId}\``
- Update `monitor_alerts_log.notified` postaje `notified_push` + nova kolona `notified_email`

**Migracija:** dodati kolonu `notified_email BOOLEAN DEFAULT false` u `monitor_alerts_log`.

---

## 3. Sentry "essential mode" — odvojen od analytics consenta

Datoteka: `src/lib/sentry.ts`

**Promjene:**
- Maknuti consent gate na liniji 87–96
- Sentry se **uvijek** inicijalizira (osim u `development` environmentu)
- Konfiguracija ostaje minimal-by-design (već je tako): `sendDefaultPii: false`, no replay, no tracing, `beforeSend` strip query stringova
- Dodati komentar pri vrhu da objasni pravnu osnovu (legitimni interes, GDPR Art. 6(1)(f), Recital 49)

**Privacy Policy update** (`src/pages/PrivacyPolicy.tsx`):
- Novi paragraf u sekciji o obradi podataka:
  > "Tehničko praćenje grešaka (Sentry, EU region): Bilježimo poruke o iznimkama, stack trace, rutu i verziju aplikacije bez osobnih podataka, IP adrese ili user agent-a. Pravna osnova: legitimni interes (čl. 6(1)(f) GDPR) — održavanje stabilnosti i sigurnosti servisa."
- HR/EN/DE preko postojeće i18n strukture

**Cookie banner** (provjeriti `consentManager.ts`):
- Dodati napomenu da error monitoring nije dio "analytics" toggle-a već radi po legitimnom interesu
- Ažurirati memory `mem://architecture/consent-gated-analytics` da odražava novo stanje (Sentry više nije consent-gated)

---

## 4. ErrorBoundary — direktan email bypass

Datoteka: `src/components/ErrorBoundary.tsx`

Već piše `react_error_boundary` u `app_diagnostics_logs`. Dodaje se **direktan poziv** na novu pomoćnu edge funkciju `notify-crash` koja:
- prima `{ message, stack, componentStack, route, userId }`
- traži admin email-ove
- enqueue-a email s template-om `crash-alert` (s 60min dedup po `signature` u memory cache / `monitor_alerts_log` provjeri)
- ovo je dodatno na cron — daje **instant** alert (sekunde, ne ~5 min)

Razlog odvojene funkcije: ErrorBoundary se događa u browseru, a `monitor-app-health` je cron — odvajamo brzi kanal od batch kanala.

---

## 5. Tehnički detalji
- Email infrastruktura već postoji (`process-email-queue`, `send-transactional-email`, `enqueue_email`) — koristimo postojeće
- Nema duplikacije slanja: `notify-crash` koristi isti idempotencyKey format kao cron (`crash-<signature-hash>-<adminId>-<hour>`) → unutar istog sata isti signature ide samo jednom po adminu
- Email queue ima retry + DLQ + 60min TTL — pouzdano
- **Sve UI tekstove kroz i18n** (privacy policy, banner update)
- Memory update: `mem://architecture/consent-gated-analytics` → maknuti Sentry s liste consent-gated, dodati "Crash monitoring je essential, ne consent-gated"
- Novi memory: `mem://features/crash-email-alerts` — opisuje sustav (ErrorBoundary → notify-crash → email; cron monitor-app-health → email; Sentry uvijek aktivan)

---

## Što NE radimo
- Ne diramo postojeću `send-transactional-email` (jedan entry point ostaje)
- Ne brišemo push notifikacije — ostaju kao paralelni kanal
- Ne dodajemo file attachmente (nepotrebno, sve stane u email body)
- Ne mijenjamo Sentry konfiguraciju (već je minimal i GDPR-friendly)
