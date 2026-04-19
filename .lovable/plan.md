

## Što se točno dogodilo (potvrda iz baze)

Pozvani korisnik (`vinkabalance@gmail.com`, ID `e78ee9bd...`) prihvatio je pozivnicu i u bazi je sve **ispravno spremljeno**:

```
project_members.member_context             = 'business'
project_members.member_business_profile_id = be60a880-... (Mjugh d.o.o.)
```

Njegov poslovni profil "Mjugh" postoji i aktivan je. **Backend je 100% točan.**

## Gdje je bug

U `src/pages/JoinProject.tsx` (linija 132-138) i `NotificationsDropdown.tsx` (linija 227-234) postavljamo `localStorage.setItem('business_mode_enabled', 'true')` **prije redirecta**. Ali:

1. **`AppStateContext` čita `localStorage` samo jednom pri mountu** (`useState(() => localStorage.getItem(...))`) — ne re-čita pri promjeni vrijednosti.
2. Hard reload bi to riješio, ali u zadnjem fixu koristimo `navigate(...)` ili `window.location.href = '/'` koji za PWA na nekim platformama **ne pokreće punu reload sekvencu**, samo SPA navigaciju.
3. **Još veći problem**: `BusinessModeGuard.tsx` (kojeg smo nedavno popravili) gleda korisnikovu pretplatu. Pozvani korisnik je **Free** — guard onda **automatski gasi `business_mode_enabled` natrag na `false`** nakon 2 ciklusa, jer pridruženi član nema vlastiti Pro/Business pretplatu.

To je glavna prepreka: pozvani korisnik dobiva projekt u svoj Business profil, ali **ne smije ući u Business mode** jer nema Pro tier — pa guard sve ugasi i projekt nestane (jer `useProjects` ovisi o `activeBusinessProfileId` koji je `null` u Personal modu).

## Kako popraviti — 3 koraka

### 1) `BusinessModeGuard` mora dozvoliti Business mode kad korisnik ima ≥1 dijeljen projekt s `member_context = 'business'`

Logika postaje: korisnik može biti u Business modu ako:
- ima vlastitu Pro/Business pretplatu, **ILI**
- je član barem jednog projekta s `member_context = 'business'` (gost u tuđem poslu)

Dodajemo lookup u `project_members` za trenutnog korisnika i preskačemo gašenje ako ima takav red.

### 2) `useProjects` fallback — ako u Business modu nema `activeBusinessProfileId`, prikaži sve dijeljene business projekte

Trenutno u Business modu strogo filtriramo po `member_business_profile_id === activeBusinessProfileId`. Ako iz nekog razloga `activeBusinessProfileId` nije postavljen (race condition pri loadu), član ne vidi ništa. Dodati: ako je `business_mode_enabled = true` i nema aktivnog profila, automatski aktivirati prvi profil korisnika.

### 3) Redirect logika u `JoinProject.tsx` i `NotificationsDropdown.tsx` — prisilni full reload

Umjesto `navigate('/')` ili soft `window.location.href`, koristiti `window.location.replace('/')` + osigurati da se prije toga pozovu setteri iz `AppStateContext` (`setBusinessModeEnabled(true)`, `setActiveBusinessProfileId(profileId)`) — ne samo `localStorage`, nego i state u kontekstu, da bude trenutno vidljivo i ako reload nešto zabrlja.

## Bonus: očistiti dvostruke pozivnice

U bazi ima 5 prihvaćenih pozivnica za isti projekt/email — trebale bi se brisati nakon prvog uspješnog prihvaćanja, ili `INSERT` u `project_members` ima `ON CONFLICT DO NOTHING` pa se sljedeće samo "pojedu". Provjerit ću u Edge funkciji jesmo li ostavili stare invitationse u "pending" stanju ili "accepted" — i očistit ćemo logiku da se duplikati ne stvaraju.

## Redoslijed

1. Update `BusinessModeGuard.tsx` — dodati provjeru `project_members` za business kontekst
2. Update `useProjects.ts` — auto-select prvog poslovnog profila ako business mode on a `activeBusinessProfileId === null`
3. Update `JoinProject.tsx` + `NotificationsDropdown.tsx` — koristiti context settere + `window.location.replace('/')`
4. Provjera Edge funkcije `accept-project-invitation` — duplicate prevencija

Ne diramo bazu (RLS je već OK), ne diramo migracije.

