## Što treba napraviti

### 1. Prilagođeni izvori uvijek na vrhu, standardni sakriveni iza "Prikaži više"

Trenutno glavni `PaymentSourceSelector` već prikazuje custom izvore na vrhu, ali odmah ispod ide cijela lista standardnih (Banka, Kartica, Gotovina, PayPal, Revolut, Wise…). U više drugih dijaloga ista situacija (cijela lista standardnih je inline).

**Rješenje:** napraviti jedan zajednički helper za render `<SelectContent>` izvora plaćanja:

`src/components/add-expense/PaymentSourceOptions.tsx` (nova komponenta):
- Renderira **gore**:
  - Poslovni custom izvori (ako business mode)
  - Osobni custom izvori
  - Pozajmica grupa (kad je primjenjivo)
- Renderira **dolje** jedan `SelectItem`-style toggle red `▼ Prikaži standardne izvore` (i18n).
- Klik na toggle (lokalni state unutar komponente, bez zatvaranja Selecta) prebacuje u prikaz svih `PAYMENT_SOURCE_GROUPS`.
- Kad korisnik nema niti jedan custom izvor → toggle je već otvoren po defaultu (da ne ostane prazna lista).
- Ako je trenutno odabrana vrijednost standardni izvor → otvoren po defaultu (inače user ne bi vidio što je izabrano).

**Zamijeniti inline render u:**
- `src/components/add-expense/PaymentSourceSelector.tsx` (glavni — Add/Edit form)
- `src/components/add-expense/ManualExpenseForm.tsx` (Transfer destination select)
- `src/components/add-expense/ScannedDataPreview.tsx` (nakon skeniranja računa)
- `src/components/EditTransactionDialog.tsx`
- `src/components/recurring/RecurringTransactionDialog.tsx`
- `src/components/CSVImportDialog.tsx`
- `src/components/BulkActionsToolbar.tsx` (bulk change payment source)

Filteri u izvještajima/listama (`TransactionListDialog`, `TransferListDialog`, `ReportsDialog`, `OpenBankingPanel` mapper) koriste payment source samo za filtriranje — primijeniti isti helper samo gdje korisnik bira izvor *za upis transakcije*. Filter selektore ne mijenjamo da ne razbijemo postojeći flow (potvrditi pri implementaciji).

### 2. Auto-match "Gotovina" → prilagođeni izvor istog imena

Kad AI/OCR vraća `payment_method: "cash"` (ili `"card"`), a u `customPaymentSources` postoji istoimeni custom izvor (case/diacritic-insensitive: `gotovina` ↔ `Gotovina`, `cash`, `kartica`, `card`, `banka`, `bank`), preferirati custom umjesto standardnog mapiranja.

**Lokacije za fix:**
- `src/hooks/useReceiptScanner.ts` linije 267–275 — proširiti mapiranje:
  ```
  if data.custom_payment_source_id → koristi
  else if data.payment_method === 'cash':
      najprije pokušaj findCustomByName(['gotovina','cash'])
      → ako postoji: paymentSource = `custom:${id}`, set custom_payment_source_id
      → inače: 'cash'
  isto za 'card' → ['kartica','card','bank card','debit','credit'] / 'bank' fallback
  ```
- Provjeriti `src/hooks/useAICategorization.ts` (ako i ono postavlja payment_source nakon spremanja transakcije manualno) i primijeniti isti helper.

**Helper:** novi `src/lib/paymentSourceMatching.ts` s funkcijom:
```ts
matchCustomByMethod(method: 'cash'|'card'|'bank', sources: CustomPaymentSource[]): CustomPaymentSource | null
```
Normalizacija: `name.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')`. Mapiranje sinonima:
- cash → gotovina, cash, keš, kes
- card → kartica, card, debitna, kreditna, visa, mastercard
- bank → banka, bank, žiroračun, žiro, transakcijski

Korisnik nakon toga može ručno promijeniti u Selectu (već radi).

### 3. i18n ključevi (HR/EN/DE)
- `paymentSources.showStandard` — "Prikaži standardne izvore" / "Show standard sources" / "Standardquellen anzeigen"
- `paymentSources.hideStandard` — "Sakrij standardne izvore" / …

### 4. Što NE diramo
- DB schema (nema potrebe).
- Edge function `scan-receipt` — već zna vraćati `custom_payment_source_id` kad dobije listu, fallback radimo client-side.
- Logiku custom:UUID parsiranja, balanceUpdater, transferMatching — netaknuto.
- Native push / version bump (ne tiče se ovog requesta).

### Rezultat za korisnika
- Svaki dialog za odabir izvora plaćanja: gore samo njegovi custom izvori, standardni iza jednog klika.
- Skeniranje računa s `payment_method=cash` i postojećim custom izvorom "Gotovina" → automatski izabere taj custom (može mijenjati ručno).
