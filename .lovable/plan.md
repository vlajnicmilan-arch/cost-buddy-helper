

## Plan: Kartica "Prijenosi" → samo tekući mjesec

### Lokacija (potvrđeno)
Kartica se nalazi u **`src/components/home/SummarySection.tsx`**, linija ~210-213, gdje se prikazuje `formatAmount(totalTransfers)` (kumulativno).

Vrijednosti `monthlyTransfers` i `monthlyTransferCount` već se računaju u `useExpenses.ts` i prosljeđuju kroz `Index.tsx → PersonalModeView/BusinessModeView → SummarySection` — samo ih treba iskoristiti.

### Izmjena
U `SummarySection.tsx`:
1. Veliki iznos: `totalTransfers` → `monthlyTransfers`
2. Brojač iznad ("X prijenosa"): `allTransfers.length` → `monthlyTransferCount`
3. Dodati malu oznaku tekućeg mjeseca ispod iznosa (npr. "travanj 2026"), konzistentno s Prihodima/Rashodima — već postoji varijabla `currentMonthLabel` u istoj komponenti
4. Ukloniti redundantnu donju sekciju "Ovaj mjesec: X prijenosa" jer postaje glavni prikaz

### Što NE diram
- `useExpenses.ts` (vrijednosti već postoje)
- `Index.tsx`, `PersonalModeView`, `BusinessModeView`, `SharedDialogs` — `totalTransfers` i dalje treba za `TransferListDialog` (lista prikazuje sve prijenose s vlastitim filterima)
- `Dashboard.tsx` — to je druga stranica (stari dashboard), ne tiče se ovog zahtjeva
- `PaymentSourceTransactionsDialog` — ima vlastitu logiku po izvoru

### Datoteke
- `src/components/home/SummarySection.tsx` — jedina izmjena

