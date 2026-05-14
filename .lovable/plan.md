## Problem

U `PaymentSourceTransactionsDialog` (i ostala 2 dijaloga koja koriste `BulkActionsToolbar`) postoji gumb "Grupna promjena", ali na mobilnom viewportu (384px) ne reagira. Razlog: koristi Radix `DropdownMenuSub` (hover-orijentirano podizbornike), što na touch uređajima u portaliziranom dropdownu unutar dijaloga zna biti nedostupno. Dodatno, ne nudi dodjelu **budžeta** ni **projekta** — samo kategoriju i izvor plaćanja.

## Cilj

Korisnik označi N transakcija unutar bilo kojeg transakcijskog dijaloga (osobito iz "Vinka kredit" izvora) i grupno im može dodijeliti / promijeniti:
- **Kategoriju**
- **Izvor plaćanja**
- **Budžet** (novo)
- **Projekt** (novo)
- Brisanje (postojeće)

Sve mora raditi pouzdano na 384px mobile.

## Promjene

### 1. `src/components/BulkActionsToolbar.tsx` (refactor)
- Maknuti `DropdownMenuSub` (problem na touch).
- Dropdown sadrži 4 ravne stavke: **Kategorija**, **Izvor**, **Budžet**, **Projekt**. Svaka otvara zaseban full-screen-friendly dijalog (`BulkAssignSheet`) sa search inputom i listom opcija.
- Za **Budžet** i **Projekt** dodati i opciju "Ukloni dodjelu" (postavlja `null`).
- Zadržati postojeći delete tijek.
- Nove props (sve opcionalne, default `true` ako handler postoji):
  - `onBulkBudgetChange?: (budgetId: string | null) => Promise<void>`
  - `onBulkProjectChange?: (projectId: string | null) => Promise<void>`
  - `showBudgetChange?`, `showProjectChange?`

### 2. `src/components/BulkAssignSheet.tsx` (novi)
Generička komponenta — prima `title`, `options[]`, `onSelect`, `searchable`, opcionalno `allowClear`. Renderira `<Dialog>` (z-[70] zbog layeringa) s pretragom i listom (44px touch targets, ikone). Reuse za sva 4 polja.

### 3. `src/hooks/useBulkActions.ts`
Dodati:
```ts
handleBulkBudgetChange(budgetId: string | null)
handleBulkProjectChange(projectId: string | null)
```
Oba pozivaju `bulkUpdateExpenses(selectedExpenses.map(e => ({ ...e, budget_id / project_id })))`. Reuse postojeći flow.

### 4. Pozivatelji `BulkActionsToolbar`
Dodati `onBulkBudgetChange` / `onBulkProjectChange` u:
- `src/components/PaymentSourceTransactionsDialog.tsx`
- `src/components/TransactionListDialog.tsx`
- `src/components/CategoryTransactionsDialog.tsx`
- `src/pages/Index.tsx` (preko `useBulkActions`)

Logika handlera identična kao postojeći `handleBulkPaymentSourceChange`, samo polje drugo. Sve update-ove ide kroz `bulkUpdateExpenses` (već postoji).

### 5. i18n (`hr`, `en`, `de`)
Novi ključevi pod `bulk.*`:
- `bulk.budget_label`, `bulk.project_label`
- `bulk.assignBudget`, `bulk.assignProject`
- `bulk.removeBudget`, `bulk.removeProject`
- `bulk.searchPlaceholder`, `bulk.noOptions`, `bulk.none`
- `transactions.bulkBudgetChanged`, `transactions.bulkProjectChanged` (count)

### 6. Što NE diramo
- Schema (`expenses.budget_id`, `project_id` već postoje).
- RLS / migracije — nepotrebne.
- `EditTransactionDialog` (single edit ostaje isti).
- Native bump — nepotreban (čisto frontend).

## Rezultat
Korisnik otvori "Vinka kredit" → označi transakcije → "Grupna promjena" → odabere Budžet/Projekt/Kategoriju/Izvor → potvrdi. Radi i na mobile (klik, ne hover), s pretragom za duge liste budžeta/projekata.
