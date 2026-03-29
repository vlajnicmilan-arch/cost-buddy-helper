
## Što je vjerojatni problem

Trenutni update flow je krhak iz dva razloga:

1. **Native provjera koristi hardkodirani URL** (`https://vmbalance.com`) umjesto stvarnog origin-a iz kojeg je app učitana.
2. **Native logika se inicijalizira izvan React komponente**, dok se sam `PWAUpdatePrompt` na native platformi uopće ne rendera (`return null`), pa je debugiranje i kontrola toka teža.

Po kodu i dostupnim URL-ovima vidi se da:
- `version.json` postoji i na `vmbalance.com` i na `cost-buddy-helper.lovable.app`
- published URL projekta je i dalje `https://cost-buddy-helper.lovable.app`
- native shell može ovisno o buildu / syncu biti na jednom ili drugom originu

Zato je vrlo moguće da se klik na “Provjeri ažuriranja” izvršava iz jednog origin-a, a fetch ide na drugi, pa pada zbog cross-origin/network ponašanja u WebView-u.

## Plan popravka

### 1) Refaktorirati update logiku da ne ovisi o jednom hardkodiranom URL-u
U `src/components/PWAUpdatePrompt.tsx`:
- maknuti oslanjanje na samo `LIVE_APP_ORIGIN`
- dodati resolver koji bira URL ovim redom:
  1. `window.location.origin` ako je `http/https`
  2. fallback na `https://vmbalance.com`
  3. fallback na `https://cost-buddy-helper.lovable.app`

To znači da native app prvo provjerava verziju na **stvarnoj domeni s koje je trenutno otvorena**, a tek onda proba alternativne domene.

### 2) Dodati fallback pokušaje umjesto jednog fetch-a
`fetchLatestVersion()` treba:
- probati više kandidata (`current origin`, `vmbalance.com`, `cost-buddy-helper.lovable.app`)
- vratiti prvu valjanu verziju
- logirati koji URL je uspio / pao

Tako se izbjegava situacija da jedan pogrešan origin sruši cijelu provjeru.

### 3) Odvojiti native update flow od PWA service worker flowa
Isti file trenutno miješa:
- **web/PWA** update preko `useRegisterSW`
- **native** update preko fetch-a i reload-a

Plan je:
- zadržati PWA dio za web
- uvesti jasnu native granu koja ne ovisi o service worker lifecycleu
- zadržati `window.location.reload()` za native kad se otkrije novija verzija

To će smanjiti edge-caseove i učiniti ponašanje predvidljivijim.

### 4) Učiniti native inicijalizaciju pouzdanijom
Umjesto da se native `checkForUpdatesRef` postavlja samo na module-load razini:
- inicijalizaciju premjestiti u sigurniji runtime tok unutar komponente ili zasebne helper funkcije
- export `checkForUpdates()` neka uvijek koristi istu centralnu logiku

Cilj: da klik iz `SettingsDialog.tsx` uvijek poziva stabilan handler, bez obzira kad je modul učitan i kako je platforma detektirana.

### 5) Poboljšati dijagnostiku
Dodati detaljnije logove:
- koji origin je odabran
- koji URL-ovi su pokušani
- je li fail bio `response not ok`, JSON parse ili network exception

Po želji se može i korisnički toast malo poboljšati:
- umjesto samo `Provjera nije uspjela`
- prikazati npr. `Provjera nije uspjela. Pokušan je produkcijski server, ali odgovor nije dobiven.`

## Datoteke koje bih mijenjao

- `src/components/PWAUpdatePrompt.tsx` — glavni popravak
- `src/components/SettingsDialog.tsx` — eventualno samo minimalno, ako želimo prikazati bolji status / poruku tijekom provjere

## Očekivani rezultat

Nakon ove izmjene:
- “Provjeri ažuriranja” više neće ovisiti o jednoj domeni
- radit će i ako native app trenutno koristi `.lovable.app` ili custom domenu
- ako jedna domena ne odgovori, sustav će automatski probati drugu
- dobit ćemo jasnije logove ako problem ipak ostane

## Tehničke napomene

- `version.json` je već ispravno postavljen u `public/`
- `capacitor.config.ts` već pokazuje na `vmbalance.com`, ali APK može biti napravljen iz starijeg native sync stanja, zato fallback na više origin-a ima smisla
- web/PWA i native update mehanizme treba držati odvojene jer nisu isti runtime

## Verifikacija nakon implementacije

1. Publish frontend promjene
2. Otvoriti postojeći APK
3. U postavkama kliknuti **Provjeri ažuriranja**
4. Potvrditi da:
   - više ne javlja `Provjera nije uspjela`
   - javlja ili `Aplikacija je ažurna!` ili ponudi reload kod novije verzije
5. Po potrebi provjeriti console logove za točan URL koji je korišten
