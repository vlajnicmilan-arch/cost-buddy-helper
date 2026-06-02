## Cilj
U kartici "Nedavno" (homepage) u naprednim filterima dodati novi filter **Izvor plaćanja** koji nudi sve korisničke izvore plaćanja (custom payment sources) + standardne (gotovina/kartica/banka).

## Promjene

### 1. `src/components/TransactionFilters.tsx`
- `FilterState`: dodati `paymentSource: string | undefined` (format kao u DB: `'cash' | 'card' | 'bank' | 'custom:UUID'`).
- Props: nove opcionalne `showPaymentSourceFilter?: boolean` i `paymentSources?: CustomPaymentSource[]`.
- U `hasActiveFilters`, `clearFilters`, `defaultFilters` uključiti novo polje.
- U panelu naprednih filtera dodati `<Select>` (Wallet ikona iz lucide):
  - opcije: "Svi izvori" (all), Gotovina, Kartica, Banka, pa lista korisničkih izvora s ikonom+nazivom.
- U `applyFilters`: ako je `paymentSource` postavljen → `item.payment_source === filters.paymentSource`. Tip generika proširiti s `payment_source?: string`.

### 2. `src/components/home/TransactionListSection.tsx`
- Novi prop `paymentSources: CustomPaymentSource[]`.
- Proslijediti `showPaymentSourceFilter` i `paymentSources` u `<TransactionFilters>`.
- U `hasActiveFilters` dodati `filters.paymentSource`.

### 3. Pozivatelji `TransactionListSection`
- `src/components/home/PersonalModeView.tsx` i `BusinessModeView.tsx` (i svi mjesti gdje se mountira): dohvatiti listu kroz postojeći `useCustomPaymentSources()` hook i proslijediti je. U Business modu već postoji aktivan profil — koristi se hookova interna filtracija.

### 4. i18n (`hr/en/de.json`)
- `filters.paymentSource` ("Izvor plaćanja" / "Payment source" / "Zahlungsquelle")
- `filters.allPaymentSources` ("Svi izvori" / …)
- `filters.cash`, `filters.card`, `filters.bank` (ako već ne postoje — provjeriti i reusati).

### 5. Bez DB i edge promjena
Filter je čisto klijentski; `expenses.payment_source` već postoji.

## Što ostaje izvan opsega
- Bulk operacije, izvještaji, ostali ekrani (Wallet/Budget/Project dialogs već imaju vlastite mehanizme).
- Bez patcha postojećih filtera, bez izmjene rute/URL state-a.
