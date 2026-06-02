# Fix: Stale-chunk greške ne smiju trigerirati alerte

## Problem
Nakon AI deploya, otvoreni browseri pokušaju učitati stari lazy chunk (npr. `Index.tsx?t=...`) koji više ne postoji. To je benigno — app se sam recoverira reloadom. Trenutno se ipak loguje u `app_diagnostics_logs` kao `react_error_boundary`, što cron pretvara u push/email alert (lažni "🔴 V&M Balance: 1 greška").

## Uzrok
`ErrorBoundary` i globalni `window.error` / `unhandledrejection` handleri zovu `tryRecoverFromChunkError()` koji ima 30s reload guard. Kad guard blokira drugi poziv za isti chunk error, kod **propada dalje** u `logDiagnostic('react_error_boundary')` + `notifyCrash` → alert.

## Rješenje
Razdvojiti dvije provjere u svakom error handleru:

1. **`isChunkLoadError(error)`** → **potpuni skip** (no log, no Sentry, no notifyCrash, no setState za error UI). Vratiti samo `tryRecoverFromChunkError()` da pokuša reload ako guard dozvoli.
2. Sve ostale greške → postojeći flow nepromijenjen.

### Konkretne izmjene
- `src/components/ErrorBoundary.tsx` — u `componentDidCatch`: ako `isChunkLoadError` → pozovi recover i `return` PRIJE Sentry/logDiagnostic/notifyCrash. Isto u `getDerivedStateFromError` (ne postaviti `hasError: true` za chunk errore).
- `src/main.tsx` (ili gdje su global handleri) — `window.addEventListener('error')` i `unhandledrejection`: isti pattern, chunk error = silent.
- Helper `isChunkLoadError` već postoji; reuse.

### Što se NE mijenja
- 30s reload guard ostaje (sprečava reload loop).
- Pravi runtime errori i dalje idu kroz alert flow.
- Cron `monitor-error-spikes` ostaje, samo dobiva manje šuma.

## Verifikacija
- Trigger ručno: simulirati `ChunkLoadError` u konzoli → nema novog reda u `app_diagnostics_logs` s `event='react_error_boundary'`.
- Nakon idućeg deploya: provjeriti da `monitor_alerts_log` ne dobije novi `chunk` alert za userov uid.

## Bez izmjena na
- DB shemi
- i18n
- UI komponentama izvan ErrorBoundary
