
Cilj: prije novog APK-a još jednom suziti problem na ono što je najvjerojatnije stvarni uzrok i napraviti set sigurnih popravaka koji ciljaju upravo početni/public flow (`/`, `/app`, `/setup`, `/auth`).

Što sam pronašao
1. Najjači sumnjivac više nije service worker.
   - U kodu već postoji agresivno gašenje starih service workera i cacheva (`index.html`, `src/main.tsx`, `public/sw.js`).
   - Zbog toga mislim da je “stari bundle” sada manje vjerojatan nego prije.

2. Najjači novi sumnjivac je globalni Android back manager.
   - `src/contexts/BackButtonContext.tsx` globalno gura lažne history unose čim se app učita.
   - Na back pritisku, ako ruta nije `/home`, `/dashboard` ili `/`, on uvijek radi `navigate('/home')`.
   - To je loše za javne ekrane kao `/auth` i `/setup`, jer tamo back ne bi smio gurati korisnika na `/home`.
   - To vrlo dobro objašnjava tvoje simptome: čudno vraćanje, potrebu da “dva puta izađeš”, i osjećaj da app zapne u krivom ekranu.

3. Public-route zaštita je popravljena, ali je još krhka.
   - `App.tsx` i `LockScreen.tsx` imaju ručne liste public ruta.
   - To je duplirana logika i lako se raziđe.
   - Uz to se provjerava točno podudaranje putanje; to je osjetljivo na trailing slash i slične edge caseove.

4. Još uvijek postoje globalni fixed layeri koje treba dodatno “otupiti”.
   - Radix toast viewport je već zaštićen.
   - Ali i dalje postoji globalni Sonner toaster i još nekoliko fixed overlay komponenti.
   - Ne tvrdim da je to glavni uzrok, ali za Android WebView želim ih dodatno osigurati da nikad ne gutaju tapove kad nemaju aktivan sadržaj.

5. APK koji skidaš nakon Publisha nije automatski “novi native build”.
   - Publish mijenja web sadržaj koji postojeći instalirani app učitava.
   - Novi APK treba tek ako je problem u samom native shellu ili ako želimo ugraditi native promjene.

Plan popravka
1. Ojačati i ograničiti back-button logiku samo na stvarni app dio
   - Uvesti jedinstvenu helper funkciju za razlikovanje public ruta i app ruta.
   - Onemogućiti globalno `pushState` ponašanje na public ekranima.
   - Spriječiti da back s `/auth`, `/setup`, `/install`, `/reset-password`, policy stranica i sličnih ruta radi redirect na `/home`.
   - Na public ekranima back treba ili vratiti natrag normalno, ili pustiti izlaz iz appa.

2. Centralizirati public-route logiku
   - Jedan shared helper koristiti u:
     - `src/App.tsx`
     - `src/components/LockScreen.tsx`
     - `src/components/CookieConsentBanner.tsx`
     - po potrebi još gdje postoji route-based overlay ponašanje
   - U helperu normalizirati path (npr. trailing slash) da ne ostane rupa.

3. Dodatno “otupiti” globalne overlaye
   - Provjeriti i po potrebi postaviti `pointer-events: none` na globalne fixed kontejnere koji ne bi smjeli blokirati ekran kad su prazni.
   - Posebno:
     - Sonner toaster
     - eventualni globalni update prompt/container slojevi
     - sve top-level fixed layere na public ekranima

4. Dodati ciljanu dijagnostiku za idući pokušaj
   - U native/public flow ubaciti kratke, ciljane console logove:
     - koja je ruta aktivna
     - je li back manager aktivan
     - je li neki globalni overlay renderiran
     - zaključava li se app lock i na kojoj ruti
   - To će nam, ako i dalje ne proradi, odmah pokazati je li problem routing/back ili stvarno neki overlay.

5. Pojačati start-up ponašanje u native appu
   - Dodati zaštitu da na početnom loadu native app ne ostane u “polu-javnom / polu-app” stanju.
   - Ako treba, uvesti jasnije preusmjeravanje za native start tako da public flow bude determinističan.

6. Tek nakon toga odlučiti treba li novi APK
   - Ako problem nestane nakon web promjena i Publisha: ne treba novi native build.
   - Ako i dalje ostane isto unatoč ciljanim popravcima i logovima: onda je opravdano raditi novi APK, jer ćemo imati puno jači dokaz da je problem u native shellu/WebView ponašanju.

Datoteke koje bih dirao
- `src/contexts/BackButtonContext.tsx`
- `src/App.tsx`
- `src/components/LockScreen.tsx`
- `src/components/CookieConsentBanner.tsx`
- `src/components/ui/sonner.tsx` i/ili globalni CSS
- novi shared helper, npr. za public route provjeru
- po potrebi `src/main.tsx` za dodatnu boot dijagnostiku

Tehnička procjena prioriteta
- Prioritet 1: `BackButtonContext.tsx`
- Prioritet 2: centralni public-route helper + overlay guardovi
- Prioritet 3: Sonner/global fixed layer hardening
- Prioritet 4: dijagnostički logovi
- Prioritet 5: odluka o novom APK-u tek nakon retesta

Zaključak
Da znam što je problem? Ne 100%, ali sada je krug puno uži. Najvjerojatniji stvarni uzrok više mi nije cache/service worker, nego kombinacija:
- globalnog back intercepta na public ekranima
- krhke public-route zaštite
- mogućeg globalnog fixed layera koji u Android WebView okruženju još uvijek može blokirati interakciju

Ako odobriš, sljedeći korak bi bio da implementiram ovaj set popravaka ciljano na public/auth/setup flow, bez čekanja na novi APK.
