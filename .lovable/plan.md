## Cilj

Integrirati Sentry za React frontend (web + Capacitor APK) — automatic crash & error capture s breadcrumbs, release tracking i source maps. Edge funkcije ostaju za sada, dodajemo ih kasnije ako bude potrebe.

## Što već imamo

- `@sentry/react` v10.39.0 već instaliran u `package.json` ✅
- DSN: `https://e71c65a2c4b6da7f654257df9b5fa8f0@o4511302417973248.ingest.de.sentry.io/4511302422167632` (EU region)
- Postojeći `diagnosticLogger.ts` s `window_error`, `unhandled_rejection`, `react_error_boundary` capture
- `ErrorBoundary` komponenta već loga critical evente

## Strategija (potvrđena ranije)

**"Sentry primaran, diag samo za custom"** — Sentry hvata sve crash/error evente sa stack traceom i breadcrumbima. `app_diagnostics_logs` ostaje za business evente (`receipt_scan_*`, `boot_*`, `route_change`, `expense_insert_attempt`, `notify_invoke_*`).

## Implementacijski koraci

### 1. DSN kao runtime config (ne hardkodiran)

DSN je javan po dizajnu, ali ga pohranjujemo kao **Vite env var** (`VITE_SENTRY_DSN`) tako da:
- Lako ga mijenjaš bez code change
- Možeš ga isključiti u dev modu postavljanjem na prazan string

Dodajem ga u `.env` automatski tijekom implementacije (Lovable Cloud ima pristup za izmjene osim za Supabase varijable).

> Napomena: ako Lovable env tooling ne dozvoljava `VITE_*` varijable, fallback je hardkodirati DSN u `src/lib/sentry.ts` (sigurno jer je javan).

### 2. Novi file: `src/lib/sentry.ts`

Centralizirana inicijalizacija s:
- `Sentry.init()` s DSN-om, environment (`development` / `production` / `preview`), release tag (iz `APP_VERSION`)
- **`tracesSampleRate: 0`** — ne plaćamo performance tracing (free tier 5k/mj je samo errors)
- **`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`** — Session Replay isključen (štedi quotu)
- **`sendDefaultPii: false`** — ne šaljemo IP/UA automatski (GDPR)
- **`beforeSend` filter** — odbacuje:
  - `AbortError`, `signal is aborted`
  - Capacitor `is not implemented on` / `UNIMPLEMENTED`
  - ResizeObserver loop limit warnings
  - Network errors u offline modu (`navigator.onLine === false`)
- **`beforeBreadcrumb` filter** — uklanja console.log breadcrumbs (samo console.warn/error)
- Integracije: `browserTracingIntegration` ISKLJUČENA, `breadcrumbsIntegration` ON
- `Sentry.setTag('platform', 'web' | 'android' | 'ios')` na osnovu Capacitora
- `Sentry.setUser({ id })` kad se user ulogira (samo `id`, bez emaila — GDPR)

### 3. Inicijalizacija u `src/main.tsx`

Dodajem **prije** `logDiagnostic('boot_start')`:
```ts
import { initSentry } from './lib/sentry';
initSentry();
```

### 4. Wrappam `ErrorBoundary` komponentu

U `src/components/ErrorBoundary.tsx` u `componentDidCatch`:
- Postojeći `logDiagnostic('react_error_boundary')` ostaje
- Dodajem `Sentry.captureException(error, { contexts: { react: { componentStack } } })`

### 5. Ažuriram `src/lib/diagnosticLogger.ts`

U `window.addEventListener('error')` i `unhandledrejection` handlerima:
- Postojeći `logDiagnostic` ostaje (za diag tablicu — postupno fade out)
- Dodajem `Sentry.captureException()` za stack trace + breadcrumbs

> Ovime izbjegavamo dupliciranje: Sentry će grupirati pametno, a diag tablica ostaje fallback dok ne potvrdimo da Sentry stabilno radi.

### 6. User context sync

U `useAuth` hooku (ili gdje se updateuje auth session) dodajem:
```ts
Sentry.setUser(user ? { id: user.id } : null);
```
Pošto već imamo `supabase.auth.onAuthStateChange` u `diagnosticLogger.ts`, dodajem Sentry call tamo.

### 7. Admin panel: "Sentry" shortcut gumb

U `src/pages/Admin.tsx` (Pulse / Diagnostics tab) dodajem gumb:
- Label: "Otvori Sentry Dashboard" (i18n key)
- Otvara `https://tactura-jdoo.sentry.io/issues/` u novom tabu (`window.open` na webu, `Browser.open` na nativeu)
- Vidljiv samo adminima (već postoji RBAC)

### 8. Test error gumb (samo za admin)

U Admin panelu dodajem mali "Test Sentry" gumb koji baci `throw new Error('Sentry test from VM Balance admin')`. Time:
- Potvrđujemo da Sentry prima evente
- Sentry će označiti onboarding kao završen ("Waiting for error" → green)

### 9. i18n ključevi

Dodajem nove ključeve u `src/i18n/locales/{hr,en,de}.json`:
- `admin.sentry.openDashboard`
- `admin.sentry.testError`
- `admin.sentry.testErrorSent`

## Što NE radimo (sad)

- ❌ Edge funkcije (Deno SDK) — ostavljamo za fazu 2 ako bude potrebe
- ❌ Source maps upload — Lovable build pipeline ne podržava `sentry-cli` u build hooku; minified stack ostaje, ali Sentry barem grupira po hash-u. Ako ti zatreba pravi unminified stack, kasnije možeš ručno uploadati source maps iz published builda
- ❌ Performance monitoring (`tracesSampleRate > 0`) — ne plaćamo, free tier je samo errors
- ❌ Session Replay — štedi quotu i privatnost

## Rizici i mitigacija

| Rizik | Mitigacija |
|-------|-----------|
| Quota overshoot (>5k/mj) | `beforeSend` filter agresivan; production-only kroz `environment` check |
| Duplicirani eventi (Sentry + diag) | Phase 1: oba; Phase 2 (za 2 tjedna nakon validacije): uklonimo `window_error`/`unhandled_rejection`/`react_error_boundary` iz diag |
| Capacitor specific noise | Filter `is not implemented on` u `beforeSend` |
| GDPR | `sendDefaultPii: false`, samo `user.id`, EU region (Frankfurt) |

## Datoteke koje mijenjamo

1. **NEW** `src/lib/sentry.ts` — init, beforeSend, helpers
2. `src/main.tsx` — pozvati `initSentry()` na vrhu
3. `src/components/ErrorBoundary.tsx` — dodati `Sentry.captureException`
4. `src/lib/diagnosticLogger.ts` — dodati `Sentry.captureException` u global handlers + `setUser` u onAuthStateChange
5. `src/pages/Admin.tsx` — dodati "Otvori Sentry" + "Test Sentry" gumbe
6. `src/i18n/locales/hr.json`, `en.json`, `de.json` — 3 nova ključa
7. `.env` — dodati `VITE_SENTRY_DSN` (ako tooling dopušta; inače hardcode u `sentry.ts`)

## Validacija nakon implementacije

1. Otvorim preview, kliknem "Test Sentry" u Adminu
2. Provjerim u Sentry UI da event stigao (~5 sec)
3. Provjerim da onboarding na sentry.io pokazuje "Onboarding complete"
4. Triggeram pravi error (npr. baci u console: `throw new Error('test2')`) i provjerim breadcrumbs (route changes, klikovi prije erora)
5. Verificiram da `app_diagnostics_logs` i dalje prima business evente

## Saznam dodatno (post-deploy)

- Za Capacitor APK: stack traces će biti malo nemir jer source maps nisu uploadane, ali Sentry će grupirati po error message + minified stack signature → i dalje korisno za detekciju regresija
- Email alerts: Sentry default šalje email za nove issue → ne treba dodatna konfiguracija
