

## Plan: Popravak troškova projekta + izvori plaćanja u poslovnom modu

### Identificirani problemi

#### 1. Greška kod dodavanja troška projekta iz poslovnog moda
U `ProjectTransactionsTab.tsx` (linija 252–266), `INSERT` u tablicu `expenses` **NE postavlja `business_profile_id`**. Kad korisnik dodaje trošak projektu unutar poslovnog moda:
- transakcija se snima bez veze na poslovni profil
- pojavljuje se kao osobni trošak, ne poslovni
- može vraćati grešku zbog RLS politike ili business_profile_id constraint-a
- saldo se ne ažurira jer nema `payment_source` (koristi se `useBalanceUpdater` u `useExpenseCRUD`, ali ovaj `INSERT` zaobilazi taj hook i ide direktno u Supabase)

#### 2. Nedostaje izbor izvora plaćanja u dijalogu za dodavanje troška projekta
`ProjectTransactionsTab` koristi vlastiti dijalog za dodavanje troška koji **nema selektor izvora plaćanja** (`payment_source`). Polja koja postoje: iznos, opis, kategorija, datum, faza, priroda. Iako se `payment_source` koristi u filtrima i prikazu (linija 121, 403, 694), u formi za unos ga **uopće nema**.

Posljedica: trošak projekta se nikada ne odbija od konkretnog računa → saldo računa nije usklađen sa stvarnošću.

#### 3. Nema poslovnih izvora plaćanja
Hook `useCustomPaymentSources` filtrira po `activeBusinessProfileId` (linija 48–52) i dodavanje novog računa preko `addCustomPaymentSource` automatski dodjeljuje `business_profile_id` (linija 211). **To radi ispravno** — nedostaju samo zapisi.

Korisnik vidi prazan novčanik u poslovnom modu jer nije kreirao niti jedan poslovni račun. **Tab "Novčanik"** u poslovnom modu (`BusinessWallet.tsx`) već nudi `CustomPaymentSourcesPanel` s gumbom "+", što je tehnički ispravno — samo nedostaje suggestion/empty state koji jasno govori "kreirajte prvi poslovni račun".

#### 4. `BusinessTransactions` "Novo" gumb ne radi
U `Business.tsx` linija 119: `onAddClick={() => {}}` — prazna funkcija. Klikom na "Novo" u tabu Transakcije ne otvara se ništa.

---

### Rješenja

#### A. Popravak `ProjectTransactionsTab` — `business_profile_id` u INSERT
- Dodati `useAppState()` i izvući `activeBusinessProfileId`
- U `handleAddExpense` proširiti `INSERT` payload s `business_profile_id: activeBusinessProfileId || null`
- Isto napraviti za `handleSaveEdit` ako projekt mijenja kontekst

#### B. Selektor izvora plaćanja u dijalogu projekta
- Dodati `useCustomPaymentSources()` u `ProjectTransactionsTab`
- U formi (Add + Edit dialog) dodati `<Select>` za izbor `payment_source` s opcijom "Bez izvora" (default)
- Vrijednost spremati kao `custom:{uuid}` (postojeća konvencija)
- Nakon uspješnog INSERT pozvati `useBalanceUpdater.updateBalance(...)` da se saldo automatski ažurira
- Isto za UPDATE (preko `handleTransactionUpdate`)

#### C. Bolji empty state za poslovni novčanik
- U `BusinessWallet.tsx` ili kroz `CustomPaymentSourcesPanel`: kad nema niti jednog izvora i `activeBusinessProfileId` postoji, prikazati hint: "Dodajte prvi poslovni račun (npr. Tekući račun tvrtke, Blagajna...)" + jasniji CTA
- Predložiti tipične poslovne izvore (Žiroračun, Blagajna, Devizni račun) kroz postojeći `SUGGESTED_PAYMENT_SOURCES`

#### D. Popravak "Novo" gumba u `BusinessTransactions`
- U `Business.tsx` proslijediti pravi handler koji otvara `AddExpenseDialog` (već postoji u personal modu)
- Alternativno: nakon klika preusmjeriti na FAB iz `Business` ekrana koji već kreira poslovne troškove

---

### Datoteke
- `src/components/projects/ProjectTransactionsTab.tsx` — dodati `business_profile_id` + payment source selector + balance update
- `src/pages/Business.tsx` — povezati `onAddClick` s pravim dijalogom
- `src/components/business/BusinessWallet.tsx` — empty state + suggestions
- `src/i18n/locales/{hr,en,de}.json` — novi ključevi za labele i hintove

### Što NE diram
- RLS politike (postoje, rade kako treba)
- Shema baze (`business_profile_id` već postoji u `expenses` i `custom_payment_sources`)
- Logiku salda (`useBalanceUpdater` se samo poziva nakon INSERT/UPDATE)
- Personal mode flow

