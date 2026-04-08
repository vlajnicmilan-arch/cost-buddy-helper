
# Refaktoriranje Index.tsx (1068 → ~400 linija)

Index.tsx sadrži: business mode view, personal mode view, 15+ dialog stanja, bulk akcije, recurring logiku, i identičnu sekciju transakcija u oba moda.

---

## Nove datoteke u `src/components/home/`

| Datoteka | Sadržaj | ~Linija |
|----------|---------|---------|
| `BusinessModeView.tsx` | Cijeli business mode rendering (header, tabovi, dashboard sadržaj, dialozi) | ~320 |
| `TransactionListSection.tsx` | Collapsible lista transakcija s filterima, bulk toolbar-om, checkbox selekcijom — koristi se u oba moda | ~120 |
| `SharedDialogs.tsx` | TransactionList/Transfer/Detail/Edit/PaymentSource dialozi + RecurringPanel + RecurringMatchDialog | ~100 |
| `PersonalModeView.tsx` | Personal mode layout (header, trial, checklist, payment sources, summary, cashflow, transakcije, quick links, footer) | ~180 |

## Hook za bulk akcije

| Datoteka | Sadržaj |
|----------|---------|
| `src/hooks/useBulkActions.ts` | handleToggleSelect, handleSelectAll, handleClearSelection, handleBulkCategoryChange, handleBulkPaymentSourceChange, handleBulkDelete |

## Pristup

- State ostaje u Index.tsx — podkomponente primaju props
- `TransactionListSection` prima filtrirane transakcije, selection state i handlere
- `SharedDialogs` prima open/onChange state za sve dialoge
- Business i Personal renderiraju iste `TransactionListSection` i `SharedDialogs`
- Recurring logika (addExpenseWithRecurringCheck, importWithRecurringCheck, handleRecurringMatchConfirm) ostaje u Index.tsx jer ovisi o mnogo lokalnog stanja

## Rezultat

Index.tsx pada na ~400 linija (state + hookovi + routing logika + dva return-a koji koriste nove komponente)
