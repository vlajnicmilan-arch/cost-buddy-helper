## Problem

Kod bulk brisanja transakcija (npr. iz `PaymentSourceTransactionsDialog` ili `ImportBatchDialog`) saldo izvora plaćanja se NE ažurira točno.

## Root cause

`bulkDeleteWithoutUndo` u `src/pages/Wallet.tsx` i `src/pages/Index.tsx` poziva:

```ts
await Promise.allSettled(ids.map(id => deleteExpense(id, { silent: true })));
```

Sve `deleteExpense` pozive pali paralelno. Svaki interno radi (`useBalanceUpdater.updateBalance`):
1. `SELECT balance FROM custom_payment_sources WHERE id = X`
2. izračuna `newBalance = currentBalance + delta`
3. `UPDATE custom_payment_sources SET balance = newBalance`

Pošto sve transakcije u dijalogu pripadaju **istom izvoru**, svi paralelni pozivi pročitaju **isti `currentBalance`** prije nego ijedan zapiše. Posljedica: last-write-wins, saldo se vrati samo za jednu transakciju (ili nijednu), iako su sve obrisane iz baze. Klasičan lost-update race; nema veze s RLS / RPC fixom.

Isti rizik postoji u `Index.tsx` (Dashboard bulk delete) i bilo gdje gdje `onBulkDeleteExpense` mapira na isti izvor.

## Fix

Serijalizirati pozive (`for...of await`) u oba bulk wrappera. Dovoljno je jer:
- `deleteExpense` već ispravno radi reversal balansa (`updateBalance(..., true)`)
- Sekvencijalno = nema preklapanja čitanja/upisa za isti `custom_payment_source`
- Performance-impact je minimalan (tipično <50 transakcija po batchu)
- Nema guarda/timeouta/hacka — uklanja se paralelizam koji je arhitekturno krivi izbor

### Izmjene

**`src/pages/Wallet.tsx`** — `bulkDeleteWithoutUndo`:
- zamijeniti `Promise.allSettled(...)` s `for (const id of ids) { try { await deleteExpense(id, { silent: true }); succeeded++ } catch { failed++ } }`
- zadržati postojeću `showError` poruku za parcijalne greške i `refetch` na kraju

**`src/pages/Index.tsx`** — `bulkDeleteWithoutUndo`:
- ista izmjena, ista logika brojanja
- zadržati `refetch()` i `refetchPaymentSources()` na kraju (tek nakon svih)

### Što se NE dira

- `useBalanceUpdater` (logika reversala je točna)
- `softDelete` RPC i `hide_soft_deleted` RLS politika
- `useExpenseCRUD.deleteExpense` (single delete tok je već ispravan)
- `restoreExpenseFull` u Trash flow-u (već reaplicira balans pri vraćanju)
- Single delete (s undo) — ide jedan po jedan pa nije pogođen
- Bez re-sync skripte za prošle slučajeve (po dogovoru — koristi se "Korekcija salda" ako negdje primijetiš krivi saldo)

## Verifikacija

1. Otvoriti izvor plaćanja s npr. 5 transakcija, zapamtiti saldo
2. Bulk obrisati svih 5
3. Saldo izvora mora se ažurirati za točan zbroj svih obrisanih iznosa
4. Ponoviti za import batch brisanje
5. Vraćanje iz Smeća (`restoreExpenseFull`) mora vratiti saldo na originalnu vrijednost
