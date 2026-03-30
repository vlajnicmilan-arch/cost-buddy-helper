
Cilj: popraviti povratak postojećih korisnika pri svakoj prijavi i ukloniti sve race conditione između auth sessiona, storage moda i onboarding statusa.

1. Uvesti jedinstveni “readiness” sloj
- U `useAuth.ts` jasno odvojiti:
  - `authReady` = session je restauriran iz browser storagea
  - `user` = postoji prijavljen korisnik ili ne
- Zadržati postojeći pattern `onAuthStateChange` prije `getSession`, ali hook mora postati jedini izvor istine za auth spremnost.

2. U `AppStateContext.tsx` dodati onboarding readiness
- Dodati npr. `appStateReady` / `onboardingResolved`
- Nakon što je auth poznat:
  - ako nema korisnika: state odmah označiti spremnim
  - ako korisnik postoji: dohvatiti profil i odrediti je li onboarding završen
- Pri tome sinkronizirati:
  - `onboarding_completed`
  - `user_display_name`
  - po potrebi restore `finmate-storage-config`
- Ne oslanjati se više na “ako localStorage postoji onda je gotovo”, nego backend profil treba biti glavni izvor za existing user scenarij.

3. Centralizirati routing odluke u `App.tsx`
- `AppRoutes` treba čekati:
  - `isInitialized` iz storage contexta
  - `authReady`
  - `appStateReady`
- Dok readiness nije gotov: prikazati loader
- Tek nakon toga odlučiti:
  - gost → `/auth`
  - postojeći korisnik s onboardingom → `/home`
  - stvarno novi korisnik → `/onboarding`
- Time se uklanja prerano preusmjeravanje na onboarding.

4. Očistiti duplu redirect logiku u `Auth.tsx`
- Trenutno `Auth.tsx` ima vlastiti async redirect nakon login-a i dodatne profile upite.
- To treba pojednostaviti:
  - login/signup samo odrade autentikaciju
  - eventualno postave `storageMode = cloud`
  - ne donose finalnu odluku o `/home` vs `/onboarding`
- Redirect treba prepustiti globalnom routingu iz `App.tsx`, da postoji samo jedno mjesto odluke.

5. Očistiti duplu provjeru u `Onboarding.tsx`
- Trenutni page opet provjerava localStorage i profil te sam vraća na `/home`
- To treba svesti na zaštitnu provjeru preko konteksta, bez dodatnih konkurentnih upita koji mogu vratiti korisnika naprijed-natrag
- Onboarding page treba biti prikazan samo kad je globalno već potvrđeno da onboarding nije dovršen.

6. Uskladiti `StorageSetup.tsx`
- Trenutno koristi `authLoading` + ručni `getSession()` + kratko čekanje
- To je krhko
- Prebaciti i ovu stranicu da koristi isti readiness model:
  - postavi storage mode
  - dalje routing odlučuje globalni app shell
- Ukloniti improvizirano čekanje i sekundarne auth provjere gdje nisu nužne.

7. Provjeriti logout i ponovno logiranje
- U `PageHeader.tsx`, `Index.tsx` i dijelovima settingsa sada se radi `localStorage.clear()`
- To treba pregledati i standardizirati tako da se:
  - obrišu user-specifični ključevi
  - sačuva ono što treba (`theme`, eventualno storage config ako je to namjera)
- Bitno je da nakon novog login-a returning user ne ovisi o starom localStorage stanju nego o backend profilu.

8. Posebno pokriti sve načine prijave
- Email/password login
- Google OAuth login
- Session restore nakon refresh-a
- PWA / instalirana app varijanta preko `/app`
- Povratak na aplikaciju nakon odjave i ponovne prijave

Datoteke koje gotovo sigurno treba mijenjati
- `src/hooks/useAuth.ts`
- `src/contexts/AppStateContext.tsx`
- `src/App.tsx`
- `src/pages/Auth.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/StorageSetup.tsx`
- moguće još:
  - `src/components/PageHeader.tsx`
  - `src/pages/Index.tsx`
  - `src/components/SettingsDialog.tsx`

Očekivani rezultat
- Postojeći korisnik, bez obzira prijavljuje li se mailom ili Googleom, nakon prijave ide direktno u aplikaciju
- Novi korisnik ide u onboarding
- Nema više slučajnog vraćanja na “postavi izvore plaćanja”
- Routing odluke dolaze iz jednog centralnog mjesta, pa je ponašanje konzistentno u cijeloj aplikaciji

Tehnička napomena
- Glavni problem nije samo Google login, nego to što aplikacija trenutno ima više paralelnih izvora istine:
  - `useAuth`
  - `Auth.tsx`
  - `AppStateContext`
  - `Onboarding.tsx`
  - `StorageSetup.tsx`
- Ispravan smjer je: auth readiness + onboarding readiness + jedan centralni router decision flow.
