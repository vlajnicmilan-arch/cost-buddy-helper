## Problem

Klik na crveni badge "Uvoz • N tr." u listi transakcija izvora plaćanja ne otvara `ImportBatchDialog` (dijalog s gumbom "Obriši cijeli uvoz").

## Root cause

- `PaymentSourceTransactionsDialog` koristi `z-[60]`
- `ImportBatchDialog` (`src/components/ImportBatchDialog.tsx`, linija 68) koristi `z-50`
- Dijalog se zapravo **otvara** (state se mijenja), ali ostaje **ispod** parent dijaloga pa korisnik vidi da se "ništa ne događa"

Isti scenarij vrijedi i ako se badge klikne unutar `TransactionListDialog` ili `BusinessTransactions`.

Memory `mobile-dialog-layering-v2` već propisuje konvenciju: glavni dijalog `z-[60]`, nested popover/sub-dialog `z-[70]`.

## Fix

`src/components/ImportBatchDialog.tsx`, linija 68:

```diff
- className="fixed inset-0 z-50 bg-background flex flex-col"
+ className="fixed inset-0 z-[70] bg-background flex flex-col"
```

To je jedna izmjena. Nema promjene logike, ni DB, ni i18n.

## Verifikacija

1. Otvori novčanik → klikni izvor plaćanja → otvori se `PaymentSourceTransactionsDialog`.
2. Skrolaj do bloka transakcija s crvenim "Uvoz • N tr." badge-om.
3. Klik na badge mora otvoriti full-screen `ImportBatchDialog` s listom uvezenih transakcija i kantom u zaglavlju.
4. Klik na kantu otvara `AlertDialog` "Obriši cijeli uvoz" — potvrda briše sve transakcije iz batcha.

## Što NE radim

- Ne diram funkcionalnost brisanja, fingerprint logiku, niti UI badge-a.
- Ne diram druga dva mjesta (`TransactionListDialog`, `BusinessTransactions`) — isti fix automatski rješava i njih jer dijele isti `ImportBatchDialog`.
- Bez version bump-a (nema native promjene).
