

# Sortiranje transakcija po datumu transakcije u Novčaniku

## Problem
U `PaymentSourceTransactionsDialog` transakcije se sortiraju po `created_at` (datum unosa u sustav), a ne po `date` (datum transakcije). To znači da uvezene transakcije ili ručno unesene s ranijim datumom završe na krivom mjestu.

## Promjena
**Datoteka:** `src/components/PaymentSourceTransactionsDialog.tsx`, linije 113-127

Zamijeniti trenutnu sort logiku koja koristi `created_at` kao primarni sort s logikom koja koristi `date` (datum transakcije):

```typescript
.sort((a, b) => {
  // Primary sort: transaction date descending
  const dateA = a.date.getTime();
  const dateB = b.date.getTime();
  if (dateB !== dateA) return dateB - dateA;
  // Secondary sort: created_at descending (for same-day transactions)
  return (b.created_at ?? '') > (a.created_at ?? '') ? 1 : -1;
});
```

Ovo osigurava da se transakcije uvijek prikazuju kronološki po datumu transakcije, neovisno o tome kad su unesene.

