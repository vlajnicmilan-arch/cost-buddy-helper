# Nalaz: ponašanje aplikacije bez internetske veze

Samo nalaz. Nijedna datoteka nije mijenjana.

## Sažetak (najvažnije prvo)

Na Android APK-u aplikacija se **uopće ne učita bez veze**. `capacitor.config.ts:7` postavlja `server.url: 'https://vmbalance.com/app?forceHideBadge=true'` — WebView učitava web s interneta, ne iz lokalnog `dist` bundlea. Bez signala nema HTML-a, nema JS-a, nema ekrana. Sve ostalo niže (sesija, cache, red čekanja) vrijedi samo za web/PWA kontekst ili za slučaj kad veza padne dok je app već otvoren.

Drugi ključni nalaz: red čekanja za offline unos **postoji kao kod, ali nije spojen ni na jedno mjesto unosa**. `addToQueue` iz `src/hooks/useOfflineQueue.ts:64` nema nijednog pozivatelja u `src/` (jedina pojava je unutar samog hooka, redak 131 u return objektu). Dakle: unos bez veze se ne sprema u red.

---

## 1. Ulazak u aplikaciju bez veze

- Supabase klijent čuva sesiju: `persistSession: true`, `autoRefreshToken: true`, `storage: localStorage` (`src/integrations/supabase/client.ts:13-15`). JWT preživi restart.
- `AuthContext` (`src/contexts/AuthContext.tsx`) prvo postavlja `onAuthStateChange`, zatim `supabase.auth.getSession()` (lokalno čitanje, radi offline), pa **validira sesiju prema serveru** s `supabase.auth.getUser()` (redak ~88).
- Ključno: `catch` oko te validacije (redak ~101-105) izričito zadržava keširanu sesiju kad je greška mrežna („Network failure — keep the cached session"). Znači: **prijavljeni korisnik ne biva izbačen na login zbog nedostatka veze.**
- Rizik: `getUser()` bez veze ovisi o timeoutu fetch-a; nema eksplicitnog timeouta u tom pozivu. Do njegovog odbacivanja `authReady` je `false`, a `AppRoutes` vraća `<PageLoader />` (`src/App.tsx:253-256`). To je potencijalno dugo bijelo/loader stanje, ali ne trajno.
- Ako sesija istekne offline (refresh token se ne može zamijeniti), `getSession()` vraća `null` → cloud mode šalje na `/auth` (`src/App.tsx:281`).

## 2. Dva načina pohrane (`storageMode`)

Definicija: `src/contexts/StorageContext.tsx`, vrijednost u `localStorage` pod ključem `finmate-storage-config`.

- **`local`** — aktivan samo uz `storageMode === 'local' && !user` (npr. `src/hooks/useExpenseFetch.ts:52`, `useExpenseCRUD.ts:174`). Transakcije žive u IndexedDB bazi `finmate-local` (`src/lib/storage/indexedDB.ts:3`, stores: `expenses`, `receipt_items`, `settings`). Čitanje `getLocalExpenses`, pisanje `saveLocalExpense`. **Sve radi bez veze**, jer se backend uopće ne dira.
- **`cloud`** — svaki upis ide izravno u `expenses` preko Supabase klijenta (`useExpenseCRUD.ts:190` nadalje). Nema lokalnog zapisivanja u IndexedDB u cloud modu.
- Dakle da, ponašanje bez veze je bitno drukčije: lokalni mod je potpuno offline-sposoban, cloud mod nije.
- Napomena: lokalni mod nema sinkronizaciju, dijeljenje, projekte na više uređaja ni backup u oblak — u praksi nije opcija za majstora s timom.

## 3. Unos bez veze (cloud mod)

- **Trošak (ručni unos):** `addExpense` u `src/hooks/useExpenseCRUD.ts`. Insert bez mreže baca grešku, `catch` na retku 536-545 loga i prikazuje `showError(t('toasts.premiseAddError'))` te re-throwa. **Ništa se ne sprema.** Unos je izgubljen.
- **Red čekanja:** `src/hooks/useOfflineQueue.ts` implementira `localStorage` red (`vmbalance_offline_queue`), `addToQueue`, `syncQueue`, auto-sync na povratak veze (redak 117-121). Ali **`addToQueue` se nigdje ne poziva** — provjereno `rg -n "addToQueue" src`, jedini pogoci su definicija (64) i export (131). Red je uvijek prazan; funkcionalno ne postoji.
- **Skeniranje računa:** `src/hooks/useReceiptScanner.ts:129` zove edge funkciju `parse-receipt` (native HTTP put ili `fetch` na retku 177). Bez veze poziv puca i baca (`throw httpErr`, redak 173). AI parsiranje je **isključivo serversko** — offline skeniranje ne postoji. Fotografija se u tom toku ne parkira za kasnije.
- **Označavanje faze gotovom:** `src/hooks/useProjectMilestones.ts` radi izravne `supabase.from(...).update(...)` pozive (npr. redci 383, 420, 519). Bez veze update ne prolazi; nema offline zapisa.

Zaključak: **u cloud modu nijedan zapis nastao bez veze ne preživi.**

## 4. Čitanje bez veze

- **Service Worker: ne postoji.** `src/lib/pwa-register-stub.ts` je stub koji nikad ne registrira SW (komentar u datoteci to izričito kaže — uklonjen zbog stale bundlea i APK buga). `index.html:88-89` aktivno **odjavljuje** postojeće SW registracije. `vite.config.ts` nema `VitePWA`. Dakle nema offline cachea ljuske aplikacije.
- **React Query persistence: ne postoji.** `src/App.tsx:88-97` — običan `QueryClient`, bez `persistQueryClient` / `createSyncStoragePersister`. Cache je samo u memoriji i gubi se pri zatvaranju.
- **Postoji `instantCache`** (`src/lib/instantCache.ts`) — JSON snapshoti u `sessionStorage` s `localStorage` fallbackom, dakle preživljavaju restart. Koriste ga: `useExpenseFetch.ts` (ključ `expenses:v2:<userId>`, redak 21-22), `useProjects.ts`, `useCustomPaymentSources.ts`, `useAIInsights.ts`.
- Praktično: ako je app već jednom učitan i prijavljen, offline se **vide zadnje poznate transakcije, projekti i izvori plaćanja** iz `instantCache`. Sve ostalo (budžeti, faze, članovi, izvještaji, Krug) nema cache i ostaje prazno ili u greški.
- Ali na APK-u ovo je akademsko: bez veze se ni ljuska ne učita (točka 0).

## 5. Što korisnik vidi

- Detekcija mreže **postoji**: `useOfflineQueue` sluša `window online/offline` i `@capacitor/network` `networkStatusChange` (redci 34-49).
- Banner **postoji**: `src/components/OfflineBanner.tsx`, montiran u `src/App.tsx:173`. Prikazuje crvenu traku „Nema veze" (`offline.noConnection`) preko cijele širine kad `isOnline === false`.
- Ali banner je jedina povratna informacija. Pojedinačne akcije (spremanje, skeniranje) ne kažu „nema veze" — prikazuju generičku grešku, npr. `toasts.premiseAddError` (`useExpenseCRUD.ts:542`).
- Beskonačna učitavanja: da, moguća. `useExpenseFetch` postavlja `loading` na temelju cachea (redak 44) i gasi ga tek u `fetchExpenses`; ekrani bez `instantCache` podrške (budžeti, faze, Krug) ostaju na skeletonu jer nemaju offline granu. Također `PageLoader` dok `authReady` čeka mrežni `getUser()` (točka 1).
- Ne postoji nijedan ekran tipa „Ovo zahtijeva vezu" — provjereno, ne postoji.

## 6. Povratak veze

- Auto-sync reda čekanja postoji u kodu (`useOfflineQueue.ts:117-121`), ali je bez učinka jer red nikad nije popunjen.
- `refetchOnWindowFocus: false` globalno (`src/App.tsx:93`). `refetchOnReconnect: true` postoji **samo** za Krug hookove (`src/hooks/useKrugQueryOptions.ts:11`, `useKrugSharedPaymentSources.ts:51,71`).
- Većina podataka se dohvaća ručnim `useEffect` fetchevima, ne React Queryjem, pa **nema automatskog refetcha na povratak veze** — korisnik mora ručno osvježiti ili prošetati navigacijom. Iznimka: `useCustomPaymentSources.ts:283` ima app-resume/tab-return refetch.
- **Konkurentne izmjene:** nema optimistic-concurrency zaštite. Update putanje rade `.update(...).eq('id', ...)` bez provjere `updated_at`/verzije (nema `If-Match` ni version usporedbe u `useExpenseCRUD.ts`). Ponašanje je last-write-wins: zadnji upis pregazi tuđi, bez upozorenja i bez detekcije konflikta.

---

## Ukupna slika za korisnika na gradilištu

| Scenarij | Stvarno ponašanje |
|---|---|
| APK, bez signala, pokretanje | App se ne otvara (remote `server.url`) |
| APK, signal pao dok je app otvoren | Crveni banner; čitanje iz `instantCache` na dijelu ekrana |
| Unos troška bez veze | Greška, podatak izgubljen |
| Skeniranje računa bez veze | Greška, nema odgode za kasnije |
| Faza gotova bez veze | Ne sprema se |
| Povratak veze | Ništa se ne šalje samo; refetch samo na Krugu |

## Ako se odluči popravljati (nije dio ovog naloga)

Redoslijed po odnosu učinak/rizik:
1. `capacitor.config.ts` — maknuti `server.url` i pakirati `dist` u APK. Bez toga svaki drugi offline rad je besmislen.
2. Spojiti `addToQueue` na `addExpense` (i skener) kad `isOnline === false`, uz vidljiv brojač neposlanog.
3. Poruke specifične za „nema veze" umjesto generičke greške.
4. `refetchOnReconnect` globalno + konfliktna zaštita na `updated_at` prije pisanja.
