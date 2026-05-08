
## Što sam našao u Pulse-u

Najnoviji "crash" (08.05. 04:28, app v1.2.0, /auth):
```
TypeError: Failed to fetch dynamically imported module: .../src/pages/Auth.tsx
```

**Ovo nije bug u kodu.** Klasičan **stale lazy-chunk** problem:
1. Korisnikov preview/PWA imao u memoriji staru verziju `index.html` koja referencira `Auth.tsx?hash=ABC`
2. U međuvremenu deploy → novi hash `DEF`, stari URL više ne postoji
3. `React.lazy(() => import('./pages/Auth'))` baca `TypeError: Failed to fetch dynamically imported module`
4. ErrorBoundary uhvati → severity=`critical` → **email alert** (lažna uzbuna)

Dokazi: stack je čist Vite/Browser bez naše logike, route je lazy-loadan, console pokazuje `[vite] server connection lost` neposredno prije, isti tip greške već viđen 04.05. (App.tsx).

## Cilj

Stale-chunk error treba **tiho samo-popraviti** (jednokratni reload) umjesto: prikaza crash UI-a, slanja maila, i logiranja kao critical.

## Implementacija

### 1. Novi helper `src/lib/chunkLoadError.ts`
- `isChunkLoadError(err)` — prepoznaje sve varijante poruke (Chrome/Safari/Firefox + `ChunkLoadError`)
- `tryRecoverFromChunkError(err)` — uz `sessionStorage` loop-guard (30 s) okida `window.location.reload()`; vraća `true` ako je recovery pokrenut

### 2. `src/components/ErrorBoundary.tsx`
- U `componentDidCatch`: na početku `if (tryRecoverFromChunkError(error)) return;` — preskače log, Sentry i `notifyCrash`

### 3. `src/lib/diagnosticLogger.ts`
- U `window.error` i `unhandledrejection` listenerima: prvo `tryRecoverFromChunkError(...)` → `return` ako true (uklanja `window_error` i `unhandled_rejection` šum iz Pulse-a)

### 4. `src/lib/sentry.ts`
- Dodati / proširiti `beforeSend` da vraća `null` kad je exception chunk-load error (čisti i Sentry dashboard)

### 5. Pulse filter (bonus, preporučeno)
- U `src/hooks/usePulseMetrics.ts` filtrirati postojeće zapise gdje `details.message` matcha `isChunkLoadError`, da se i historijski lažni "criticali" više ne prikazuju u Top Issues

## Što se NE mijenja
- `notify-crash` edge funkcija (ostaje za prave crasheve)
- Pulse UI, layout, i18n stringovi
- Lazy import logika u `App.tsx`
- Bez DB migracija, bez novih dependencija

## Tehničke napomene
- 30 s `sessionStorage` guard sprječava reload-loop ako reload ne riješi problem (npr. server stvarno down) — tada ErrorBoundary preuzima normalno
- Hard `location.reload()` dohvaća svjež `index.html` s novim chunk URL-ovima; ovo je standardni Vite pattern za stale chunk
