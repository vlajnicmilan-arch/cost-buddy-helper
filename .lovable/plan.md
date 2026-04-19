

## Plan: Kartica "Nedavno" — crveni rub + mjesečni brojač

### Promjene

**1. `src/components/home/TransactionListSection.tsx`**
- Wrapper: dodati lijevi crveni rub (`borderLeftWidth: 3`, `borderLeftColor: 'hsl(var(--destructive))'`) uz postojeći `glass-card` (sjenčenje ostaje kao kod ostalih kartica).
- Brojač transakcija: kad NEMA aktivnih filtera, prikazati `monthlyTransactionsCount` + oznaku tekućeg mjeseca (npr. "12 transakcija · travanj 2026"). Kad SU filteri aktivni, ostaje `filtered / total` (logično za korisnika koji vidi rezultat filtera).
- Nova prop: `monthlyTransactionsCount: number`.

**2. `src/pages/Index.tsx` (ili `PersonalModeView` / `BusinessModeView`)**
- Izračunati `monthlyTransactionsCount` iz `allExpenses` filterom po tekućem mjesecu (svi tipovi: expense + income + transfer) i proslijediti u `TransactionListSection`.

### Pretpostavka (na osnovu konteksta)
"Broj transakcija" = **svi tipovi zajedno** (rashodi + prihodi + prijenosi), jer se kartica zove "Nedavno" i lista prikazuje sve tipove. Ako želiš samo rashode, reci prije implementacije.

### Što NE diram
- `useExpenses.ts`, logiku filtera, sortiranja, salda
- `TransactionItem`, `BulkActionsToolbar`, ostale kartice

### Datoteke
- `src/components/home/TransactionListSection.tsx`
- `src/pages/Index.tsx` (ili `PersonalModeView`/`BusinessModeView` — potvrdit ću pri implementaciji)

