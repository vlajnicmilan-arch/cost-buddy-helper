

## Problem
Kad korisnik radi prijenos između računa, AI mu automatski dodjeljuje kategoriju (npr. "Hrana", "Režije") na osnovu opisa. To je **konceptualno pogrešno** — prijenos NIJE trošak ni prihod, to je **interna tranzicija novca**. Kategorija "Hrana" za prijenos s tekućeg na štedni račun nema smisla.

## Što sam pronašao u kodu

**1. AI kategorizacija (`useAICategorization.ts`)**
- Poziva se iz `ManualExpenseForm.tsx` na osnovu opisa + trgovca
- **Ne provjerava `type === 'transfer'`** — pa kategorizira i prijenose

**2. Spremanje prijenosa (`AddExpenseDialog.tsx` + `useExpenseCRUD.ts`)**
- Prijenos se sprema kao 1 zapis s `type: 'transfer'`, `payment_source` (izvor) i `income_source_id` (odredište)
- Polje `category` se i dalje popunjava — često ostane od AI-a

**3. Prikaz**
- `TransferTransactionItem` već IGNORIRA kategoriju i prikazuje `Iz → U` s ikonom `ArrowLeftRight`
- Ali u `TransactionDetailDialog`, izvještajima (`ReportsDialog`, `CategoryBreakdown`), filteru po kategoriji — kategorija se i dalje koristi
- U `Reports`/`CategoryBreakdown` već postoji filter koji isključuje transfere iz suma, ali ne svuda konzistentno

## Rješenje

### 1. Uvesti rezerviranu sistemsku kategoriju `"transfer"`
- Dodati u `src/types/expense.ts` u `getCategoryInfo()`:
  - `transfer` → ikona `ArrowLeftRight`, naziv iz i18n (`categories.transfer` = "Prijenos"), neutralna boja (muted/teal-secondary)
- Ova kategorija se NE pojavljuje u dropdownima za biranje (skrivena iz `CATEGORIES` liste)
- Koristi se isključivo interno za sve `type === 'transfer'` transakcije

### 2. Force-set kategoriju na `"transfer"` pri spremanju
- U `useExpenseCRUD.ts` (create + update): ako `type === 'transfer'`, **uvijek** override `category = 'transfer'`, bez obzira što je AI predložio ili korisnik odabrao
- Isto za masovne edite (`BulkCategoryDialog`) — blokirati promjenu kategorije za transfere

### 3. Spriječiti AI kategorizaciju za prijenose
- U `ManualExpenseForm.tsx`: NE pozivati `categorize()` ako je `type === 'transfer'`
- Ovo štedi i Lovable AI pozive

### 4. Razdvojiti opis od kategorije (UI poruka)
- U `AddExpenseDialog` formi za prijenos: ispod polja "Opis" diskretni helper tekst:
  > _"Opišite svrhu prijenosa (npr. 'Štednja za odmor'). Kategorija se automatski postavlja na Prijenos."_
- Ukloniti polje za biranje kategorije iz forme prijenosa (ako još postoji)

### 5. Backfill postojećih prijenosa
- Migracija: `UPDATE expenses SET category = 'transfer' WHERE type = 'transfer'`
- Korisničin originalni opis (npr. "Štednja za auto") OSTAJE u `description` polju — ne dira se

### 6. Filter/izvještaji
- `CategoryBreakdown`, `ReportsDialog`, `CategoryTransactionsDialog`: prijenose s kategorijom `"transfer"` **prikazati u zasebnoj sekciji** ili potpuno isključiti iz "Top kategorije" (već se djelomično radi za `type === 'transfer'`, sad je konzistentno)
- U detalju transakcije za prijenos: ne prikazivati "Kategorija: Prijenos" kao posebno polje — već je vidljivo iz `Iz → U` prikaza

### Datoteke za izmjenu
- `src/types/expense.ts` — dodati sistemsku kategoriju `transfer`
- `src/hooks/useExpenseCRUD.ts` — force `category = 'transfer'` za type=transfer
- `src/components/add-expense/ManualExpenseForm.tsx` — preskočiti AI za transfere + helper tekst
- `src/components/add-expense/AddExpenseDialog.tsx` — sakriti category picker za transfere
- `src/components/BulkCategoryDialog.tsx` — blokirati promjenu kategorije za transfere
- `src/components/TransactionDetailDialog.tsx` — sakriti redak "Kategorija" za prijenose
- `src/i18n/locales/{hr,en,de}.json` — `categories.transfer`, helper tekst
- **Migracija**: backfill `category = 'transfer'` za sve postojeće prijenose

### Što NE diram
- `TransferTransactionItem` (već ispravno prikazuje)
- Logiku salda, RLS, sortiranje, `expenses` tablicu (samo update postojećih redaka)
- Korisnikov `description` (ostaje njegov originalni opis svrhe)

