## Cilj

Lokalizirati i ukloniti uzrok crasha aplikacije kod Petra (Samsung S23, Android 16, Capacitor APK v1.2.0). Trenutni signali pokazuju da app umre nakon `push_autoregister_check` na ruti `/home`, prije bilo kakvog daljnjeg eventa. **Bez nagađanja** — prvo dijagnostika, onda fix.

## Faza 1 — Granularna dijagnostika (low-risk, samo dodaje events)

Cilj: sljedeći Petrov boot mora reći točno gdje umire.

### 1.1 Detaljan boot-trace u `src/lib/nativePush.ts`

Dodati `writeDiag` event prije i poslije svakog native poziva u `registerNativePush()`:
- `push_register_start`
- `push_perm_checked` (s vrijednošću `perm.receive`)
- `push_perm_requested` (samo ako se traži)
- `push_listeners_attached`
- `push_native_register_called` (tik prije `PushNotifications.register()`)
- `push_native_register_returned` (tik poslije)
- `push_register_token_received` (iz listenera 'registration', s prefixom tokena)
- `push_register_error` (iz listenera 'registrationError' — trenutno ide samo u console.error)

Tako ćemo vidjeti **na kojoj točno liniji umire** native poziv.

### 1.2 Boot watchdog u `src/App.tsx` (ili main.tsx)

Dodati lifecycle dijagnostiku:
- `app_boot_phase` event s `phase: 'react_mounted' | 'router_ready' | 'home_visible'`
- Na startu pročitati `localStorage.boot_in_progress`. Ako je `true` (znači prošli boot je crashao) — zapisati `previous_boot_crashed` event.
- Postaviti `boot_in_progress=true` na startu, `boot_completed=true` tek kad korisnik vidi prvu render-anu komponentu na svojoj početnoj ruti.

### 1.3 Native crash hvatanje (opcionalno, ali poželjno)

Dodati globalne handlere u `src/main.tsx`:
- `window.addEventListener('error', ...)`
- `window.addEventListener('unhandledrejection', ...)`

Oba zapisuju u `app_diagnostics_logs` s `severity: 'error'` i porukom + stack-om. Trenutno `app_diagnostics_logs` za Petra nema **nijedan** error/warning entry — što je sumnjivo i samo po sebi.

## Faza 2 — Petar: testna procedura

Nakon što Faza 1 dođe u njegovu app (ili kroz live-sync `server.url` koji već koristi `vmbalance.com`, ili kroz novi APK):
1. Force-stop aplikacije (Settings → Apps → V&M Balance → Force stop)
2. Otvori → pusti da se sruši 2–3×
3. Mi gledamo nove diag eventove — sada znamo točnu liniju gdje umire

## Faza 3 — Ciljani fix (tek nakon Faze 2)

Ovisno što Faza 2 pokaže:

- **Ako umire u `PushNotifications.register()`**: Najvjerojatnije nedostaje/krivi `google-services.json` ili Firebase init na novom Androidu. Fix = osvježiti FCM konfiguraciju, ne dodavati try/catch-eve. (Aplikacija je nedavno prešla na FCM HTTP v1 — moguć regress.)
- **Ako umire prije nego register ode**: problem je u nekoj komponenti koja se mounta na `/home` (HomePage, ActiveProjectsStrip, BottomNav, FAB feedback). Sužavamo dalje.
- **Ako umire poslije registera s 'registrationError'**: device-specific FCM problem; fallback je preskočiti push registraciju za taj device i prijaviti grešku (ne crashati app).

## Što sad NE radimo

- **NE** dodajemo defensivne try/catch-eve "za svaki slučaj"
- **NE** mičemo `autoRegisterIfEnabled` poziv samo da prestane padati — to bi sakrilo, ne riješilo problem
- **NE** mijenjamo nikakvu poslovnu logiku

## Rizik

Faza 1 je samo dodavanje `app_diagnostics_logs.insert` poziva i window error handlera. Nema promjene UX-a, nema utjecaja na ostale korisnike.

## Datoteke koje će se mijenjati u Fazi 1

- `src/lib/nativePush.ts` — granularni diag eventovi
- `src/main.tsx` — globalni error/rejection handleri + boot watchdog start
- `src/App.tsx` ili komponenta na `/home` — `app_boot_phase` eventovi
- (Bez DB migracije — koristi se postojeća `app_diagnostics_logs` tablica)

## Što Petar može napraviti odmah (privremeno olakšanje)

Reci mu:
1. Settings → Apps → V&M Balance → Storage → **Clear cache** (NE Clear data — izgubio bi PIN/login)
2. Restart telefona
3. Ako i dalje ruši: Settings → Apps → V&M Balance → Notifications → isključi sve push obavijesti, pa ponovo otvori app. Ako prestane padati — potvrda da je krivac push registracija.
