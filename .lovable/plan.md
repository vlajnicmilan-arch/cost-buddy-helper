# Odluka o offline radu — činjenice i tri puta

Samo analiza. Nijedna datoteka nije mijenjana.

## Dio 1: Činjenice

### 1. Kako se aplikacija distribuira

**Izravno, mimo Google Playa.** Put od commita do telefona:

1. Push na `main` koji dira `public/version.json`, `capacitor.config.ts`, `android/**`, `package.json` ili sam workflow → pokreće `.github/workflows/android-build.yml` (okidači, redci 3-12). Može i ručno (`workflow_dispatch`).
2. Workflow radi `npm run build`, `npx cap sync android`, potpisuje `assembleRelease` keystoreom iz GitHub secreta.
3. APK se preimenuje u `centar-<verzija>.apk` i šalje u Lovable Cloud Storage preko edge funkcije `upload-apk-release` (autorizacija `x-upload-token: APK_UPLOAD_TOKEN`) → signed URL → PUT u bucket `public-assets/releases/`.
4. `publish-version-manifest` objavi manifest (`version`, `minSupportedVersion`, `sha256`, `apkUrl`).
5. `notify-app-update` pošalje push obavijest korisnicima.
6. Korisnik preuzima s `/install` (`src/pages/Install.tsx:228`, `useLatestApkUrl`) ili iz dijaloga za ažuriranje unutar aplikacije.

Trenutno objavljeno: `public/version.json` → 3.0.1, `minSupportedVersion` 2.0.3. `android/app/build.gradle:10-11` → versionCode 20, versionName 3.0.1.

`PLAY_STORE_LISTING.md` postoji, ali navodi package `com.vmbalance.app`, dok stvarni `appId` je `app.lovable.costbuddy` (`capacitor.config.ts:4`). To je nacrt teksta za listing, ne dokaz objave. **Aplikacija nije na Play Storeu** — nema nijednog artefakta koji bi na to upućivao (nema AAB koraka u workflowu, nema `service_account.json`, nema Play publish akcije).

### 2. iOS

**Ne postoji.** Nema `ios/` direktorija u repozitoriju. Samo Android + web.

### 3. Kako korisnik danas dobiva izmjene

Dva odvojena kanala:

- **Web sadržaj (99% izmjena):** WebView učitava `https://vmbalance.com/app` pri svakom otvaranju (`capacitor.config.ts:7`). Nakon Publisha u Lovableu izmjena je na telefonu **pri sljedećem otvaranju aplikacije**, bez ikakvog preuzimanja. To je jedina stvarna prednost sadašnjeg postava.
- **Nativna ljuska (rijetko):** `useAppUpdateChecker` (`src/components/update/useAppUpdateChecker.ts`) povlači manifest na boot, na povratak u prvi plan i svakih 6 h (`POLL_INTERVAL_MS`, redak 24). Ako je udaljena verzija novija ili je ispod `minSupportedVersion` (kill switch), prikazuje `UpdateAvailableDialog` s preuzimanjem APK-a.

**Što `PWAUpdatePrompt` radi u APK kontekstu:** ništa vezano uz service worker. `src/components/PWAUpdatePrompt.tsx:4` uvozi `useRegisterSW` iz `@/lib/pwa-register-stub` — stub koji nikad ništa ne registrira. U nativnom kontekstu komponenta delegira na `NativeUpdateChecker` (redak 23), tj. na APK tok gore. Na webu služi samo kao gumb „Provjeri ažuriranja" koji uspoređuje `version.json` s `APP_VERSION`.

---

## Dio 2: Tri puta

### A. Ostati kako jest

**Što se gubi osim otvaranja bez veze**, zbog `server.url`:

1. **Loša veza je gora od nikakve.** Na 1-2 crtice u podrumu WebView čeka HTML s `vmbalance.com` do timeouta — bijeli ekran bez poruke, jer JS koji bi prikazao `OfflineBanner` još nije ni učitan.
2. **Prekid usred rada = gubitak.** Korisnik unosi trošak, veza padne, insert pukne, `useExpenseCRUD.ts:542` javi generičku grešku, podatak nestaje.
3. **Ovisnost o dostupnosti hostinga.** Svaki ispad hostinga ili DNS-a znači da se aplikacija ne otvara nikome, uključujući čitanje već upisanih podataka.
4. **Skeniranje računa nikad ne radi na terenu.** `parse-receipt` je serverski poziv (`useReceiptScanner.ts:129`) — ovo ostaje istinito i u opciji B, ali u A ne možeš ni fotografiju odložiti za kasnije.
5. **Hladan start je uvijek mrežni.** Nema mjerenja u repozitoriju, ali svako pokretanje povlači cijeli bundle preko mreže; na slabom signalu to su sekunde do desetaka sekundi.

**Posao:** 0 dana. **Rizik:** poznat i trenutno prisutan. **Što korisnik osjeti:** odmah — na svakom gradilištu bez signala aplikacija je mrtva ikona.

### B. Zapakirati `dist` u APK

Konkretno: maknuti `server.url` iz `capacitor.config.ts`, ostaviti `webDir: 'dist'`. WebView tada učitava iz APK-a (na Androidu origin postaje `https://localhost`).

**Kako korisnik od tada dobiva izmjene:**

Put od commita do telefona postaje: Publish → push na main → android-build.yml (build + potpis + upload + manifest + push obavijest) → korisnik dobije push → otvori dijalog → preuzme APK (~nekoliko desetaka MB) → Android „Instaliraj iz nepoznatog izvora" → potvrdi.

Vrijeme: pipeline traje tipično 8-15 min (build + Gradle + upload; točno trajanje nije mjereno u repozitoriju). Ali stvarni čimbenik nije pipeline nego **korisnik mora ručno prihvatiti instalaciju**. Kod izravne distribucije to je realno sati do dana, a dio korisnika nikad ne ažurira. Danas je to nula koraka.

**Play Store recenzija:** nije relevantna jer se ne distribuira kroz Play. To je i argument za B i protiv B: nema recenzije od 1-3 dana, ali nema ni automatskog ažuriranja u pozadini koje Play daje. Izravni APK znači: svaka izmjena = ručna instalacija na svakom telefonu.

**Što se lomi u postojećem kodu** (sve provjereno):

| Mjesto | Problem |
| --- | --- |
| `src/pages/Auth.tsx:643,689` | `redirect_uri: ${window.location.origin}/app` → postaje `https://localhost/app`, nije valjan OAuth redirect |
| `src/lib/paddleClient.ts:113` | `successUrl: ${window.location.origin}/app?checkout=success` → isto; Paddle traži odobrenu domenu |
| `src/hooks/useNativeOAuth.ts:7` | `HTTPS_BRIDGE = 'https://vmbalance.com/native-oauth/callback'` — apsolutan, preživi; povratak ide custom shemom `app.lovable.costbuddy://auth` (`AndroidManifest.xml:40-41`). Ovaj tok najvjerojatnije radi, ali traži provjeru na uređaju |
| `src/hooks/useDeepLinks.ts:53` | Grana za `url.hostname === 'vmbalance.com'` postaje mrtva jer manifest nema `autoVerify` App Links filter za https — to je već danas tako, B ne pogoršava |
| `forceHideBadge` iz `server.url` | Nestaje bez posljedica — parametar služi samo skrivanju Lovable badgea u preview kontekstu |
| Push notifikacije | Nisu vezane uz `server.url` (FCM + `notify-app-update`), ostaju netaknute |
| Enable Banking redirect | **Nisam pronašao** klijentski `redirect_url` u `src/hooks/useBank*` ni `src/components/bank/` — vjerojatno se konstruira u edge funkciji. Ovo treba provjeriti prije odluke; ne tvrdim da radi ni da ne radi |

**Treba li vratiti service worker: ne.** SW je bio potreban da web bundle preživi offline. Kad je bundle u APK-u, HTML/JS/CSS se poslužuju iz aplikacije i SW nema što keširati. **Stale-bundle problem se ne vraća** — ali se seli: umjesto zastarjelog SW cachea dobivaš zastarjele APK verzije na terenu, što ublažava postojeći `minSupportedVersion` kill switch (`public/version.json`, trenutno 2.0.3).

Važno: **B sam po sebi ne daje offline unos.** Daje samo da se aplikacija otvori i da se vide keširani podaci iz `instantCache` (transakcije, projekti, izvori plaćanja). Za unos bez veze i dalje treba red čekanja (odvojeno pitanje niže).

**Opseg posla kroz Lovable:**
- Sama izmjena konfiguracije: sati.
- Zamjena `window.location.origin` centraliziranom konstantom kanonske domene + provjera OAuth/Paddle tokova: 1-2 dana.
- Testiranje na stvarnom uređaju (prijava, Google prijava, Paddle kupnja, banka, push, dubinske poveznice): 1-2 dana, i to **ne mogu odraditi ja** — traži fizički Android.
- Ukupno realno: **3-5 dana rada**, uz obavezan ručni test na uređaju.

**Što može puknuti i koliko se teško primijeti:**
- OAuth i Paddle pucaju glasno — vide se odmah pri prvom testu.
- Enable Banking redirect i dubinske poveznice iz e-maila pucaju tiho — primijeti se tek kad korisnik pokuša, možda tjednima kasnije.
- Najopasnije tiho: korisnici koji ostanu na staroj APK verziji dok backend napreduje. Kill switch postoji, ali forsira preuzimanje, što na gradilištu bez signala znači zaključanu aplikaciju.

**Što korisnik osjeti odmah:** aplikacija se otvara bez signala, brže se pokreće. **Rubno:** izmjene više ne stižu same; svaka nadogradnja je ručna instalacija.

### C. Zapakirano + živo ažuriranje

Ideja: JS bundle u APK-u (offline start), a nove verzije bundlea se preuzimaju u pozadini i primjenjuju bez reinstalacije. Rješava glavni minus opcije B.

Dvije stvarne opcije na tržištu (nijedna nije u repozitoriju — ovo je istraživanje, ne nalaz o kodu):

- **Ionic Appflow Live Updates** — službeno, plaćeno, mjesečna pretplata po aplikaciji. Zrelo, ali cijena je značajna za jednog čovjeka.
- **`@capgo/capacitor-updater`** — open source plugin; može se koristiti sa Capgo cloudom (jeftinija pretplata) ili potpuno samostalno, s bundleima u vlastitom Storageu. Samostalna varijanta se dobro uklapa jer već imaš cijeli mehanizam: Storage bucket, `publish-version-manifest`, `notify-app-update`, `useAppUpdateChecker` s poll intervalom i kill switchem. Manifest bi umjesto `apkUrl` nosio i `bundleUrl` + `sha256`.

**Opseg:** B (3-5 dana) + plugin, potpisivanje/verifikacija bundlea, rollback na neuspjelu primjenu, prilagodba `useAppUpdateChecker`: **dodatnih 4-7 dana**, plus rezerva za nativne probleme koje se ne mogu otkloniti kroz Lovable.

**Krhkost:** ovo je najveći argument protiv. Živo ažuriranje ima klasu kvarova koja ne postoji ni u A ni u B: loš bundle se distribuira svima i ostavlja aplikaciju u stanju iz kojeg se ne može sama izvući. Bez automatskog rollbacka i bez „safe mode" bundlea u APK-u, jedna loša objava znači ručnu reinstalaciju kod svakog korisnika. Za jednog čovjeka bez tima to je stvaran rizik, ne teorijski.

**Napomena o pravilima:** Apple ovo eksplicitno dopušta uz uvjete; Google Play također, dok se ne mijenja svrha aplikacije. Kako se ne distribuira kroz trgovine, pitanje je zasad bespredmetno — ali postaje relevantno ako se ikad ide na Play.

---

## Dio 3: Usporedna tablica

| | A. Kako jest | B. Zapakirano | C. B + živo ažuriranje |
| --- | --- | --- | --- |
| Otvaranje bez veze | Ne | Da | Da |
| Objava izmjene | Trenutno | Ručna instalacija APK-a | Trenutno (bundle) |
| Posao | 0 | 3-5 dana | 7-12 dana |
| Test na uređaju | — | Obavezan | Obavezan, opsežniji |
| Najgori kvar | Aplikacija se ne otvara bez signala | Korisnici zaostaju na staroj verziji | Loš bundle zaključa sve korisnike |
| Vanjska usluga | Ne | Ne | Ne (uz vlastiti hosting bundlea) |

---

## Dio 4: Koliko sam po sebi vrijedi red čekanja

Pitanje je opravdano i odgovor je nijansiran.

**Ako se ostane na A:** red čekanja pomaže **samo** u scenariju „aplikacija je već otvorena, veza padne usred rada". To nije rubni slučaj — to je vjerojatno najčešći stvarni scenarij: majstor otvori aplikaciju u autu gdje ima signal, siđe u podrum, upiše tri troška. Danas sva tri nestaju. S redom čekanja sva tri prežive i pošalju se pri izlasku iz podruma.

Ne pomaže ni najmanje u scenariju „telefon je bio zaključan, aplikacija ubijena, korisnik je otvara u podrumu". Tu ništa osim B ne pomaže.

**Vrijednost po komadu:**

| Zahvat | Posao | Vrijednost bez B | Vrijednost s B |
| --- | --- | --- | --- |
| Spojiti `addToQueue` na `addExpense` | ~0.5-1 dan | Visoka — spašava unose pri prekidu | Visoka |
| Poruka „nema veze" umjesto generičke greške | ~0.5 dan | Srednja — korisnik zna zašto i da nije izgubio | Srednja |
| Vidljiv brojač neposlanog + gumb „Pošalji sad" | ~0.5 dan | Visoka — bez toga korisnik ne vjeruje redu | Visoka |
| Odgoda skeniranja računa (fotka u red, AI kasnije) | 2-3 dana | Srednja — složeniji tok | Srednja |
| Faze/projekti u red | 2-4 dana | Niža — rjeđe se radi bez veze | Niža |

**Zaključak na to pitanje:** red čekanja i poruke nisu zamjena za B, ali nisu ni uzaludni ako se B odgodi. To je 1-2 dana rada koji rješava najčešći stvarni gubitak podataka i ne baca se ako se B kasnije napravi — kod je isti, samo dobiva veći doseg.

---

## Što bih odvojeno provjerio prije odluke

1. **Enable Banking redirect** — gdje se točno gradi `redirect_url`. Nisam ga našao u klijentskom kodu; ako je u edge funkciji s tvrdo upisanom domenom, B ga ne dira. Ako se šalje s klijenta, lomi se.
2. **Veličina APK-a** s upakiranim `dist` — određuje koliko je ručno ažuriranje bolno na mobilnom podatkovnom prometu.
3. **Koliko korisnika stvarno radi bez signala** — ako je to 3 od 33, opcija A + red čekanja je poštena odluka do nakon launcha. Ako je većina, B nije opcionalan.
