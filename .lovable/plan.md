## Cilj

Kada otvoriš poslovni izvor plaćanja (npr. **Tactura**), prikazuje se isto kao i bilo koji osobni izvor: **saldo gore + lista transakcija s iznosima i tekućim saldom (running balance)**, uključujući sve transakcije uvezene iz HTML/PDF izvoda banke.

## Što trenutno ne radi

Provjerom koda vidim dvije konkretne rupe (HTML uvoz već ispravno tagira transakcije s `payment_source = custom:<TacturaID>` — to dio radi):

1. **Business novčanik (`src/components/business/BusinessWallet.tsx`)** — `<CustomPaymentSourcesPanel>` je renderiran **bez `onSourceClick` handlera**. Klik na karticu Tactura ne radi ništa, pa se detail dijalog nikad ne otvori.

2. **`/wallet` ruta** — kad klikneš poslovni izvor, `PaymentSourceTransactionsDialog` dobiva `expenses={allExpenses}`. `allExpenses` je već filtrirano po **view-modeu** (`useExpenseFetch` → `contextFilteredExpenses`). U **personal viewu** se poslovne transakcije izbacuju, pa lista bude prazna iako transakcije **postoje u bazi** s ispravnim `payment_source`.

Postojeći `PaymentSourceTransactionsDialog` već ispravno računa saldo + per-row running balance + filtrira po `custom:<id>` i karticama (linije 88-156, 124+) — ne treba ga dirati.

## Plan promjena (mali i targetirani)

### 1) `useExpenseFetch.ts` / `useExpenses.ts` — izložiti raw expenses
Vratiti dodatno `rawExpenses` (sve dohvaćene transakcije korisnika prije view-mode filtera). Ne dirati `expenses` ni `dashboardExpenses`. Konzumenti koji prikazuju **po izvoru** (a ne po viewu) koriste `rawExpenses`.

### 2) `src/pages/Wallet.tsx`
- Iz `useExpenses()` izvući `rawExpenses` i prosljediti ga kao `expenses` u `PaymentSourceTransactionsDialog` umjesto `allExpenses`.
- `BankConnection` u dnu strane ostaje "generic" import (bez forsiranja business izvora) — to je već istraženo i tamo se poštuje.

### 3) `src/components/business/BusinessWallet.tsx`
- Dodati lokalni state `selectedSource` + `dialogOpen`.
- Proslijediti `onSourceClick` u `CustomPaymentSourcesPanel`.
- Renderirati `PaymentSourceTransactionsDialog` s `rawExpenses` + `updateExpense`/`deleteExpense` iz `useExpenses()` + `importFromCSV`/`findDuplicates` (da ostane mogućnost importa direktno iz detalja izvora — kao na osobnim izvorima).

### 4) Verifikacija (bez novog koda)
- Klik na Tactura iz Business Wallet → dijalog se otvara, saldo gore, transakcije iz uvoza vidljive, running balance točan.
- Klik na isti izvor iz `/wallet` (personal pogled) → identičan rezultat.
- Klik na osobni izvor → ponašanje nepromijenjeno.

## Što NE diramo
- Logiku tagiranja kod uvoza (već radi: `BankConnection` + `BusinessTransactions` → `defaultBusinessPaymentSourceId`).
- `PaymentSourceTransactionsDialog` interno (filter + saldo već su točni).
- `dashboardExpenses` filter (i dalje poštuje view-mode i hidden sources — bitno za dashboard balance).
- Edge funkciju `parse-pdf-statement`.

## Tehničke bilješke
- `rawExpenses` = `expenses` state iz `useExpenseFetch` prije `applyViewMode` — već postoji interno, samo ga treba "izvući".
- View-mode filter postoji s razlogom (kontekstualna izolacija) — ostavljamo ga; za "po izvoru" prikaz koristimo raw set jer izvor sam definira kontekst.

