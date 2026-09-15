# Oznaka „Pozajmica" u svim popisima transakcija

## Uzrok
Projektni popis dobiva transakcije iz `useProjectStats`, koji ima uži SELECT bez `owner_funding_choice`. Badge kod je ispravan, ali polje nikad ne stigne.

## Promjene

### 1. `src/hooks/useProjectStats.ts` (obavezno)
Dodati `owner_funding_choice` u SELECT (red ~69), ništa se ne miče:

prije
```
'id, user_id, amount, description, category, date, type, milestone_id, status, submitted_by, expense_nature, payment_source, is_advance, collaborator_id, linked_advance_ids'
```
poslije — isto + `, owner_funding_choice`

Uz to `owner_funding_choice?: string | null` u lokalno `ProjectExpense` sučelje (isti hook) i u `src/components/projects/project-transactions/types.ts`, da prikaz ne ovisi o `as any`. Javno sučelje hooka ostaje isto.

### 2. `src/components/PaymentSourceTransactionsDialog.tsx`
Podaci stižu (prop `expenses` iz `useExpenses`, a `EXPENSE_LIST_SELECT` već sadrži polje), ali redak sam crta oznake i nema uvjet za pozajmicu. Dodati isti uvjet i identičan badge (🪙, `transactions.ownerLoanBadge`, isti tooltip i stil) u red oznaka uz opis, uz uvjet `type === 'expense'`. Bez drugih promjena u komponenti.

## Sweep — presuda po mjestu

| Mjesto | Izvor podataka | Oznaka sada | Presuda |
|---|---|---|---|
| Početna — `home/TransactionListSection` | `useExpenses` → `TransactionItem` | Da | bez promjene |
| Novčanik `pages/Wallet` | `useExpenses` → `TransactionItem` | Da | bez promjene |
| Biznis `business/BusinessTransactions` | `useExpenses` → `TransactionItem` | Da | bez promjene |
| Proračun `budget/BudgetFullScreenView` | `select('*')` → `TransactionItem` | Da | bez promjene |
| Projektni popis `ProjectTransactionsList` (dijalog projekta i puni prikaz) | `useProjectStats` | Ne — polje ne stiže | popravlja t.1 |
| Transakcije po novčaniku `PaymentSourceTransactionsDialog` | `useExpenses` (polje stiže) | Ne — vlastiti redak bez uvjeta | popravlja t.2 |
| `CategoryTransactionsDialog` | `useExpenses` | Ne — vlastiti redak bez uvjeta | dodati isti badge (isto pravilo) |
| `TransactionListDialog` | `useExpenses` | Ne — vlastiti redak bez uvjeta | dodati isti badge |
| Detalj transakcije `TransactionDetailDialog` | lazy po id-u | Prikazuje puni izbor knjiženja (`OwnerFundingChoiceRow`) | svjesno bez badge-a — tamo se odluka mijenja, ne samo prikazuje |
| Projektne transakcije na čekanju `useProjectPendingTransactions` | `select('*')` | Ne | svjesno ostavljeno — to su neodobrene stavke na potvrdi, ne popis knjiženih troškova |
| Pregled uvoza `pages/ImportReview` | lokalno parsirani redci, još nisu u bazi | Ne | svjesno — polje ne postoji prije spremanja |
| Krug popisi (`useKrugDecidedExpenses`, `useKrugPendingExpenses`) | `select('*')` | Ne | svjesno — Krug je dijeljena potrošnja, pozajmica vlasnika je pojam tvrtke |
| `useProjectProfitLoss`, `useActiveProjectsSummary`, `useProjectMilestones`, `useBudgetPendingTransactions` | agregacije | — | nisu popis transakcija |

Ako se tijekom izvedbe pokaže da `CategoryTransactionsDialog`/`TransactionListDialog` red nema mjesta za badge bez preloma na 360 px, badge ide u isti red uz opis s `shrink-0`, kao drugdje.

## Što se NE dira
Logika pozajmice i `ownerLoanLogic`, motor salda, `business_debts`, INSERT/UPDATE putevi troška, atribucija po projektu, RLS, izgled i tekst badge-a, javno sučelje `useProjectStats`/`useExpenses`, i18n ključevi. Bez objave.

## Provjera
`bunx tsgo` + cijeli paket testova. Živi pokus nakon objave: projekt „Lansiranje kampanje" → transakcija „test" (10 €) nosi 🪙 Pozajmica; ista oznaka i u transakcijama po novčaniku.
