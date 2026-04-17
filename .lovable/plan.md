

Cilj: Dodati pouzdano logiranje iz APK-a u Supabase tablicu kako bismo iz Lovablea u realnom vremenu vidjeli što se događa na korisnikovom uređaju, bez nagađanja.

## Što planiram napraviti

### 1. Nova tablica `app_diagnostics_logs`
Jednostavna tablica koja prima logove sa svih uređaja:
- `id` (uuid)
- `session_id` (text) — generiran pri pokretanju, grupira logove jedne sesije
- `user_id` (uuid, nullable) — ako je korisnik prijavljen
- `event` (text) — npr. `boot_start`, `splash_hidden`, `route_change`, `touch_received`, `storage_init`, `error`
- `route` (text) — trenutna ruta
- `details` (jsonb) — slobodan prostor za dodatne podatke
- `device_info` (jsonb) — UA, platforma, je li Capacitor, viewport
- `app_version` (text)
- `created_at` (timestamptz)

RLS:
- INSERT dozvoljen svima (anon i authenticated) — da app može logirati i prije prijave
- SELECT samo za admin role (vidljivo u admin dashboardu)

### 2. Diagnostic logger (`src/lib/diagnosticLogger.ts`)
Mali modul koji:
- Generira `session_id` jednom po pokretanju
- Funkcija `logDiagnostic(event, details?)` — non-blocking insert u Supabase
- Buffer + flush svakih 2s ili kad ima 5+ eventova (da ne radi 50 zahtjeva)
- Tihi failover — ako insert padne, ne ruši app
- Automatski hvata: `unhandledrejection`, `error` na window
- Loguje i u console (kao i sad)

### 3. Instrumentacija ključnih točaka
Dodati `logDiagnostic()` pozive na:
- `src/main.tsx`: `boot_start`, `splash_hide_attempt`, `splash_hide_success/fail`
- `src/App.tsx` ili AppRoutes: `route_change` (sa starom i novom rutom)
- `src/pages/StorageSetup.tsx`: 
  - `screen_mounted`
  - `touch_received` na svaki klik na opciju (čak i ako je disabled)
  - globalni `pointerdown` listener na cijeli ekran (da vidimo dolaze li uopće touch eventovi)
  - `storage_init_start`, `storage_init_success`, `storage_init_error`
- `src/contexts/StorageContext.tsx`: promjene `storageMode`

### 4. Admin pregled logova
U `src/pages/Admin.tsx` (već postoji) dodati novi tab/sekciju **"Diagnostic Logs"**:
- Lista zadnjih sesija (grupirano po `session_id`)
- Klik na sesiju → vremenska linija eventova
- Filter po `event` tipu i korisniku
- Auto-refresh svakih 5s
- Realtime subscription na novu tablicu (da vidim eventove dok se događaju)

Korisnik (ti) ćeš moći otvoriti Admin → Diagnostic Logs i u realnom vremenu vidjeti što tvoj telefon javlja kad pokreneš APK.

### 5. Bez izmjena native sloja
Ovo je čisti TypeScript/React + nova DB tablica. **Ne mijenja se `capacitor.config.ts`, ne dodaju se nativni pluginovi.** To znači:
- **Nije potreban novi APK build** — postojeći APK će preko Live Sync-a (vmbalance.com) pokupiti novi kod
- Samo trebaš zatvoriti i ponovno otvoriti app nakon što izmjene budu deployane

## Što time dobivamo

Konkretno ćemo vidjeti:
- Pokrene li se uopće JS bundle u tvom APK-u (`boot_start` event)
- Sakriva li se splash uspješno
- Stiže li StorageSetup do `screen_mounted`
- Stižu li **bilo kakvi** touch eventovi do React sloja (najvažnije pitanje)
- Kakva greška se javlja, ako se javlja

Ako vidimo `screen_mounted` ali nikad `touch_received` → problem je nativni overlay koji guta touch.
Ako vidimo `touch_received` ali ne i `storage_init_start` → problem je u logici onClicka.
Ako ne vidimo ni `boot_start` → problem je još dublje (WebView ne učitava bundle).

Bilo koji od ovih ishoda nam **konačno daje pravi smjer** umjesto nagađanja.

## Tehnički detalji (za zapis)
- Tablica je low-cost (nema FK na auth.users da insert ne padne za neprijavljene)
- Logger koristi `navigator.sendBeacon` kao fallback pri unloadu
- Cleanup: dodati cron koji briše logove starije od 7 dana (da tablica ne raste beskonačno)

