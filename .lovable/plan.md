
# Krug — read-only audit (stanje danas)

Napomena: ovo je **audit, ne plan**. Ništa se ne mijenja. Nalazi izvedeni iz čitanja src/components/krug/*, src/hooks/useKrug*, src/lib/krug*, src/pages/Krug.tsx, src/components/BottomNav.tsx, TransactionDetailDialog.tsx, entry formi, useFeatureAccess, i18n, testova i supabase/functions.

---

## 1. Surface po surface

### a) Krug list (`KrugListScreen`, `useMyKrugs`)
- **Stanje:** gotovo. Query filtrira `deleted_at IS NULL`, empty state + header CTA otvara `CreateKrugDialog`, lifecycle badge po redu, klik otvara detail.
- **Ozbiljnost gapova:** niska. Nema pretrage, sortiranja, grupiranja — u trenutnom skoupu i nije potrebno.

### b) Create Krug flow / wizard (`CreateKrugDialog`)
- **Stanje:** funkcionalno, ali **minimalno**. 3 koraka (naziv → preset → potvrda), izlaže samo 3 UI presetа (`partner`, `su_roditelj`, `cimer`) iz `KRUG_PRESETS`, INSERT direktno u `krug` uz oslon na `krug_bootstrap_creator` trigger.
- **Nedostaje:** preset opis/mikrocopy razlike, preview posljedica (npr. cap na `punopravni`), postavljanje initialnog shared izvora u istom flowu, nema pozivanja članova iz wizarda.
- **Ozbiljnost:** srednja. Radi, ali korisnik izlazi iz wizarda s praznim Krugom bez ijednog člana i bez izvora — ostatak konfiguracije mora naći sam.

### c) Detail screen (`KrugDetailScreen`)
- **Stanje:** gotovo za skeleton skope. Header s nazivom + preset + lifecycle badge, delete CTA (owner), deletion vote panel, approval queue, članovi, shared izvori. Ownership tretiran odvojeno (nije u membership enumu). 
- **Nedostaje:** aktivnost/feed, sažetak potrošnje po Krugu, presuda "tko kome duguje" (v. `k`), pinovi/nedavno.
- **Ozbiljnost:** srednja — funkcionalno da, ali detail izgleda više kao "administrativni" ekran nego kao svakodnevno mjesto boravka Krug korisnika.

### d) Members / owner / role management (`useKrug`, `useKrugMembers`, `useKrugMemberMutations`, `AddKrugMemberDialog`)
- **Stanje:** funkcionalno. Owner iz `krug_ownership`, membership enum samo `punopravni|obicni`, promocija/degradacija direct UPDATE preko RLS, remove direct DELETE, cap enforcan kao UX guard + baza vraća marker (`krug_punopravni_cap`).
- **Ograničenje:** dodavanje ide **isključivo po emailu postojećeg registriranog korisnika** (edge `krug-add-member` → `user_not_found` inače). Nema poziva neregistriranima. Confirm remove je `window.confirm`, ne shadcn dijalog.
- **Ozbiljnost:** visoka za realnu upotrebu — realna obiteljska/cimerska situacija često znači da druga strana **još nema račun**. Krug se u praksi ne može popuniti bez off-app usmene registracije.

### e) Approval queue (`KrugApprovalQueue`, `useKrugPendingExpenses`)
- **Stanje:** funkcionalno. Lista `predlozena` shared troškova (limit 50), inline A1/A2 gumbi (odluke iz `krugDecisions`), klik u red otvara `TransactionDetailDialog` → `KrugTransactionPanel`.
- **Nedostaje:** filter/tab (moje predložene vs. tuđe), batch potvrda, "sve prazno" hint, badge s brojem pending na list ekranu i BottomNav-u.
- **Ozbiljnost:** srednja. Queue je jasan ali "slijep" — bez broja pendinga na globalnoj navigaciji korisnik ne zna da nešto čeka.

### f) Shared payment source (`KrugSharedSourcesSection`, `useKrugSharedPaymentSources`)
- **Stanje:** funkcionalno za owner-owned **custom** izvore (`custom:UUID`). Built-in slugove UI **svjesno ne nudi** iako ih backend dopušta. Detach `window.confirm`.
- **Nedostaje:** vidljivost tko je izvor koristio, saldo izvora unutar Kruga, uparivanje s Krug shared statusom transakcije.
- **Ozbiljnost:** srednja. Konceptualno je čisto ali je izolirano — attach izvora ne generira nikakav follow-up UX (npr. "želiš li da se troškovi na ovom izvoru automatski predlažu Krugu?").

### g) Transaction Krug panel (`KrugTransactionPanel`, `useKrugAct`, `useKrugRetract`, `useKrugSetPrivacy`, `useKrugGovernToPersonal`)
- **Stanje:** logički kompletno za Wave 1 + 1.5. Pokriva `personal/private/shared` switch, A1/A2/A4/A5, A3 (autor retract), A7 (full member → personal). Odluke iz `krugDecisions` zrcale SQL RPC. Idempotencija preko `client_request_id`. Status badge (predlozena/potvrdjena/nepotvrdjena) prikazan.
- **Nedostaje:** UI za A3 (48h auto-expiry) i A6 svjesno **nije** dio Wave 1.5 (dokumentirano u `useKrugAct` komentaru). Panel se pojavljuje samo kad transakcija **već ima** `krug_id`.
- **Ozbiljnost:** srednja — sama logika je zrela, ali ulaz u nju je zatvoren (vidi `i)`).

### h) Delete / deletion vote flow (`KrugDeleteDialog`, `KrugDeletionVotePanel`, `useKrugDeletion`, `krugDeletionDecisions`, `cleanup-krug-deleted`)
- **Stanje:** **gotovo end-to-end i najviše dovršen dio modula.** Solo shortcut, multi-member glasovanje, jedan `reject` zatvara zahtjev, owner cancel, soft-delete + 30d grace + cron purge, pure helper s 19 vitest testova, `krug.delete.*` i18n potpun.
- **Ozbiljnost:** niska. Ovo je najzreliji surface.

### i) Lifecycle badge / poruke (`KrugLifecycleBadge`)
- **Stanje:** izloženo je 6 stanja (`active`, `early_signal`, `ugrozen`, `continuity_window`, `read_only`, `deleted`) s tonovima, ikonama, i18n note-om. Nepoznata stanja se ne renderiraju (safe).
- **Nedostaje:** **nema koda koji lifecycle prebacuje**. Nema hook-a/edge fn-a koji piše `early_signal`/`ugrozen`/`continuity_window`/`read_only` — polje je izloženo kao read-only prikaz onoga što baza upiše, a u repou ne postoji migracija koja to upisuje (grep na "early_signal" u src daje samo prikaz).
- **Ozbiljnost:** visoka konceptualno — kompletan lifecycle model je vizualiziran ali **ne živi**. U praksi svi Krugovi ostaju `active` dok se ne obrišu.

### j) Ulaz troška u Krug (entry surface)
- **Stanje:** **rupa.** `rg krug_id` po `AddExpenseDialog`, `QuickExpense*`, `ExpenseForm*` — **nula pojavljivanja**. Krug se ne može odabrati pri kreiranju troška iz nijedne standardne entry forme.
- Jedini put u Krug: transakcija već ima `krug_id` (vjerojatno automatikom kroz shared payment source na DB strani) pa se `KrugTransactionPanel` pojavi u `TransactionDetailDialog`. Ručno postavljanje `krug_id` na novi/postojeći trošak iz UI-a **ne postoji**.
- **Ozbiljnost:** kritična. Bez ovoga cijeli T7/T8 aparat (privacy switcher, A-akti, approval queue) je nedostupan većini korisničkih tokova.

### k) Split / settlement / tko kome duguje
- **Stanje:** **ne postoji.** Grep na `settle|split|owes|duguje.*krug` u src ne vraća ništa vezano uz Krug. Nema izračuna zajedničke potrošnje, individualnog udjela, saldiranja, "poravnaj s X".
- **Ozbiljnost:** kritična ako je namjera Kruga uključivala dijeljenje troška. Ako je namjera striktno "zajednički trag potrošnje bez saldiranja" (što `KRUG_PRESETS` opisi i `krug.privacyHint.shared` sugeriraju), onda je ovo *by design*. Trebalo bi eksplicitnu potvrdu vlasnika — audit ne može odlučiti umjesto namjere. **Ova jednoznačnost nedostaje u dokumentaciji.**

### l) Invite flow
- **Stanje:** samo lookup postojećeg korisnika po emailu (edge `krug-add-member`). **Nema** invitation tablice (usporedi `budget_invitations`, `project_invitations`, `payment_source_invitations` koje postoje), nema tokena, nema email šablone, nema join stranice tipa `JoinBudget`/`JoinProject`.
- **Ozbiljnost:** visoka — usklađenost s ostalim modulima ne postoji.

### m) Notifikacije / push
- **Stanje:** **nula.** Grep krug u `useNotifications.ts` i `notificationPayload.ts` prazan. Nema push-a za "nova pending Krug transakcija", "netko je potvrdio/negirao tvoj trošak", "zahtjev za brisanje Kruga čeka tvoj glas", niti in-app notifikacije. `KrugApprovalQueue` je jedini indikator, i to samo unutar `/krug` ekrana.
- **Ozbiljnost:** kritična za realan async workflow — bez notifikacija koauthoriring shared troškova ne funkcionira; potvrde bi u praksi kasnile danima.

### n) Billing / access gating
- **Stanje:** izloženo. `useFeatureAccess`: `krug` modul zaključan na `pro` tier. `BottomNav` gate-a Krug ikonu kroz `module: 'krug'` i skriva u business kontekstu.
- **Ozbiljnost:** niska za funkcionalnost, ali pitanje je paketiranja (Krug=Pro dok je nedovršen).

### o) Test coverage
- **Stanje:** čisti unit testovi na pure helperima:
  - `src/test/krugDeletionDecisions.test.ts` (19 testova)
  - `src/lib/__tests__/krugDecisions.test.ts`
  - `src/lib/__tests__/krugPresets.test.ts`
- **Nedostaje:** integracijski testovi hookova, testovi za `KrugTransactionPanel` odluke, testovi za `useKrugMemberMutations`, SQL smoke-suite za RPC-e (nema pandana `supabase/tests/balance/*` za Krug).
- **Ozbiljnost:** srednja. Logička jezgra (odluke) je pokrivena; sve što uključuje bazu / UI nije.

---

## 2. TOP 5 gapova (po ozbiljnosti za stvarnu upotrebu)

1. **Nema ulaza troška u Krug iz entry formi** (j). Bez ručnog `krug_id` na novom trošku, cijeli approval/privacy aparat je dostupan samo transakcijama koje su u Krug dospjele auto-mehanizmom preko shared izvora.
2. **Nema notifikacija** (m). Async potvrđivanje bez pusha/in-app signala u produkciji ne živi.
3. **Nema invite flow-a za neregistrirane** (l). Krug se ne može popuniti realnim članovima obitelji ako još nemaju account; nema pandana `budget_invitations`.
4. **Lifecycle model je samo vizualan** (i). 5 od 6 stanja nikad ne nastupi — engine koji piše `early_signal/ugrozen/continuity_window/read_only` ne postoji u repou.
5. **Split/settlement nije definiran** (k). Ako je Krug zamišljen kao alat za dijeljenje troška, kritičan nedostatak; ako nije, kritičan je nedostatak *jasne izjave* da to nije namjera — bez toga korisnik očekuje "tko kome duguje".

Napomena izvan top 5, ali blisko: bez badge-a na BottomNav-u za broj pendinga (e), i bez SQL smoke-suite za RPC-e (o), stabilnost Krug flowa neće biti dokazivo održiva.

---

## 3. Koliko je Krug blizu gotovog modula

- **Foundation sloj (DB+RLS+RPC decision zrcala):** procjena ~85%. `krugDecisions`, `krugDeletionDecisions`, `krugPresets` su čisti; delete flow potpuno; A1/A2/A3/A4/A5/A7 pokriveni; A6 i 48h expiry svjesno odgođeni.
- **UI sloj po surface-ima:** procjena ~55%. List, detail, wizard, queue, shared sources, transaction panel postoje ali su često "honest skeleton" (self-priznato u komentarima).
- **End-to-end korisnički journey (od poziva člana do naplate udjela):** procjena ~25%. Prekida se na: (i) pozivu neregistriranog, (ii) ulazu troška u Krug iz entry, (iii) notifikacijama, (iv) lifecycleu, (v) settlementu.
- **Test coverage:** pure helperi ~visoko; sve iznad ~nisko.

Ukupno, kompozitno: **~45–50% do „gotov modul u smislu produkcijske uporabljivosti Pro korisnika"**.

---

## 4. Presuda

**Krug je danas foundation + rani poluproizvod.**

- Foundation (podatkovni model, odluke, delete flow, RLS zrcalo) je discipliniran i zreo.
- Skeleton UI pokriva sve zaključane surface-e taxonomije, ali je namjerno minimalan.
- Kritični dijelovi korisničkog jouneya (entry → notifikacije → invite → lifecycle → settlement) nedostaju ili nisu spojeni. Zbog toga je modul ispravno klasificirati kao **poluproizvod**, ne kao gotov proizvod — unatoč tome što je već iza `pro` gate-a u `useFeatureAccess`.

Bez pomaka na 5 gore navedenih gapova, Krug u praksi funkcionira samo za jednog korisnika koji ručno upravlja svojim shared izvorima — što nije njegova namjera.
