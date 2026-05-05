## Problem

`WelcomeChecklist` (banner "Počnite s V&M Balance / Unesi prvu transakciju...") u `src/components/home/PersonalModeView.tsx` se nakratko pojavi kod svakog otvaranja Dashboarda — i kod korisnika s plaćenom verzijom i kod korisnika koji već imaju transakcije.

**Uzrok (root cause, ne simptom):**
Banner se renderira odmah na mountu, prije nego što se učitaju podaci. Inicijalno je `expenses=[]`, `customPaymentSources=[]`, `budgetsCount=0` → checklist misli da je novi korisnik i prikaže se. Tek kad stigne odgovor iz baze, vrijednosti se popune i checklist se sakrije (a kod već "all done" se sakrije tek nakon 3s timeoutom). Otud bljesak.

Trenutno jedina logika za skrivanje je `localStorage` "dismissed" flag — ne postoji ni provjera učitavanja ni provjera pretplate.

## Rješenje

Sve gating se radi u `WelcomeChecklist` komponenti (čisti popravak na izvoru, bez patch-flag-ova u parentu):

1. **Dodati nove propse:** `loading: boolean` i učiniti komponentu svjesnom pretplate preko `useSubscription()` i `useStorage()`.
2. **Ne renderiraj dok se podaci/pretplata učitavaju.** Dok je `loading === true` ili `subscription.loading === true` → return `null`. Time eliminiramo bljesak.
3. **Ne renderiraj za plaćene korisnike.** Ako je `subscribed === true` ili `tier !== 'free'` ili `source === 'admin'` ili `trialActive === true` → return `null`. Pretplatnici (uključujući trial) više nikad ne vide checklist.
4. **Ne renderiraj za korisnike koji već imaju ikakvu aktivnost.** Ako je bilo koji od `hasPaymentSources`, `hasTransactions`, `hasBudgets` već true u prvom stabilnom renderu (nakon što loading prođe), automatski tretiraj checklist kao "dismissed" (i upiši u localStorage) — tako da postojeći korisnici nikad više ne vide banner, čak ni kratko.
5. **Lokalni mod:** ostavi postojeće ponašanje (lokalni korisnici nemaju pretplatu pa checklist i dalje ima smisla za potpuno nove instalacije, ali `loading` gate će svejedno spriječiti flicker).

U `PersonalModeView.tsx` proslijediti `expensesLoading` (već postoji) kao `loading` prop.

## Datoteke

- `src/components/WelcomeChecklist.tsx` — dodati gating logiku, useSubscription, useStorage, novi `loading` prop, auto-dismiss za postojeće korisnike.
- `src/components/home/PersonalModeView.tsx` — proslijediti `loading={props.expensesLoading}` na `WelcomeChecklist`.

## Zašto ovaj pristup (a ne quick-fix)

Slijedimo pravilo iz project knowledge "Bug Fixing Strategy": uzrok je što komponenta donosi odluku o prikazu prije nego što ima sve potrebne informacije (auth/subscription/data ready). Rješenje pomiče odluku iza stabilnog stanja umjesto da dodajemo timeout/guard zakrpe. Subscription context već ima ispravan `loading` koji se ne flipa na `false` dok stvarno ne dobijemo odgovor iz backend-a, pa je idealan signal.
