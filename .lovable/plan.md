
# Plan: Popravak brisanja transakcija u izvoru plaćanja

## Problem

Kada korisnik klikne na transakciju u izvoru plaćanja, otvara se `TransactionDetailDialog` (s gumbom za brisanje). Međutim, taj dijalog koristi standardni `Dialog` komponentu koja renderira overlay i sadržaj na **z-50**, dok `PaymentSourceTransactionsDialog` koristi **z-[60]**. Rezultat: detalj dijalog se otvara **iza** izvora plaćanja i korisnik ga ne može vidjeti niti kliknuti gumb "Obriši".

Isto vrijedi za `EditTransactionDialog` — editiranje također ne radi iz istog razloga.

## Rješenje

U `PaymentSourceTransactionsDialog.tsx`, dodati viši z-index na `TransactionDetailDialog` i `EditTransactionDialog` putem wrapper `div`-ova, ili — jednostavnije — koristiti CSS klasu na `DialogContent` da se podigne iznad z-[60].

Konkretno, obzirom da `DialogContent` i `DialogOverlay` koriste `z-50`, a ne možemo ih globalno mijenjati (jer bi to utjecalo na sve dijaloge), rješenje je:

### Promjena u `PaymentSourceTransactionsDialog.tsx`

Omotati `TransactionDetailDialog` i `EditTransactionDialog` u `<div className="relative z-[70]">` kako bi portali unutar njih naslijedili stacking context iznad z-[60] — **ali** Radix portali se renderiraju na `document.body`, pa wrapper ne pomaže.

Ispravno rješenje: proslijediti `className` na `DialogContent` unutar `TransactionDetailDialog` i `EditTransactionDialog`. Ali oni ne primaju tu prop.

**Praktično rješenje**: Dodati CSS stil koji cilja Radix dialog portale kada su otvoreni unutar konteksta payment source dijaloga. Najjednostavniji pristup:

Promijeniti `TransactionDetailDialog` da prima opcionalnu `className` prop za `DialogContent`, i iz `PaymentSourceTransactionsDialog` proslijediti `z-[70]`.

### Datoteke i promjene

| Datoteka | Promjena |
|---|---|
| `src/components/TransactionDetailDialog.tsx` | Dodati opcionalnu `contentClassName` prop, proslijediti na `DialogContent` |
| `src/components/EditTransactionDialog.tsx` | Dodati opcionalnu `contentClassName` prop, proslijediti na `DialogContent` |
| `src/components/PaymentSourceTransactionsDialog.tsx` | Proslijediti `contentClassName="z-[70]"` na oba child dijaloga |

### Detalji implementacije

**TransactionDetailDialog.tsx**:
- Dodati `contentClassName?: string` u interface
- Na `DialogContent` dodati: `className={cn("sm:max-w-md max-h-[85vh]...", contentClassName)}`

**EditTransactionDialog.tsx**:
- Isto — dodati `contentClassName?: string` i proslijediti na `DialogContent`

**PaymentSourceTransactionsDialog.tsx** (linije ~941 i ~960):
```tsx
<TransactionDetailDialog
  ...
  contentClassName="z-[70]"
/>
<EditTransactionDialog
  ...
  contentClassName="z-[70]"
/>
```

Ovo osigurava da se oba dijaloga renderiraju **iznad** payment source overlay-a, čime gumbi "Obriši" i "Spremi" postaju vidljivi i funkcionalni.
