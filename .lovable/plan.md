# Hybrid bank-first model — finalna verzija

Cilj: pripremiti `expenses` tablicu, helper i UI za buduću bank sync match logiku. **Zero impact na trenutni rad dok nema prave bank konekcije.**

---

## Konceptualni model

```
Banka  = istina o novcu       → bank_only / confirmed
Račun  = istina o sadržaju    → samo enrichment, ne mijenja status
Ručno  = privremeno           → manual ili pending_bank
```

---

## Status enum

`expenses.bank_match_status` (text, default `'manual'`):

| Status | Kada se postavlja | Badge |
|---|---|---|
| `manual` | Ručni unos gotovine, ručni unos kartice **bez** bank konekcije, recurring auto-generate, **OCR/slikani račun**, backfill postojećih | — |
| `pending_bank` | Ručni unos kartice kad payment_source **ima** aktivnu bank konekciju | ⏳ |
| `confirmed` | Bank sync pronašao siguran match | ✅ |
| `bank_only` | Bank sync insert bez match-a + **CSV/PDF uvoz bankovnog izvoda** | — |

Pomoćna kolona: `possible_duplicate_of UUID NULL` — **samo fallback** kad sync ne može odlučiti.

---

## Faza 1 — Migracija (zero impact)

```sql
ALTER TABLE expenses
  ADD COLUMN bank_match_status text NOT NULL DEFAULT 'manual',
  ADD COLUMN possible_duplicate_of uuid NULL REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX idx_expenses_bank_match_status
  ON expenses(user_id, bank_match_status)
  WHERE bank_match_status IN ('pending_bank','bank_only');
```

Postojeće transakcije → `manual` (default).

---

## Faza 2 — Centralni helper

`src/lib/bankMatchStatus.ts`:

```ts
type Source = 'manual' | 'csv' | 'pdf' | 'recurring' | 'ocr';

getInitialBankMatchStatus({
  source,
  paymentSource,
  hasBankConnection,
}): 'manual' | 'pending_bank' | 'bank_only'
```

Pravila:
- `csv` | `pdf` → `bank_only` (izvod = potvrda novca)
- `recurring` → `manual`
- `ocr` → koristi istu logiku kao `manual` (račun nije bank dokaz)
- `manual`:
  - gotovina → `manual`
  - kartica/custom bez bank konekcije → `manual`
  - kartica/custom s bank konekcijom → `pending_bank`

`bank_sync` ne ide kroz helper — odluku donosi edge funkcija (match logika).

Vitest pokrivenost svih grana.

---

## Faza 3 — Integracija

1. **Ručni unos** (`useExpenseCRUD`) — helper s `source='manual'`
2. **OCR scanner** (Personal + Business) — helper s `source='ocr'`; ako se payment_source promijeni u edit modu, ponovno pozvati helper
3. **CSV uvoz** (`CSVImportDialog.tsx:218`) — eksplicitno `'bank_only'`
4. **PDF uvoz** (`GlobalPDFImportHost.tsx:94`) — eksplicitno `'bank_only'`
5. **Recurring auto-generate** — `'manual'`
6. **`bank-sync-transactions` edge** — match logika prije inserta:
   - traži kandidate: isti `user_id`, isti `payment_source` (`custom:UUID`), amount ±0.01, `bank_transaction_id IS NULL`, `bank_match_status IN ('pending_bank', 'bank_only')`
   - prozor: <10€ same day · 10–50€ ±1 day · >50€ ±3 days
   - **0 kandidata** → INSERT `bank_only`
   - **1 siguran kandidat** → UPDATE postojeći: `bank_transaction_id`, `bank_account_id`, status=`confirmed` (radi i za `pending_bank` i za `bank_only` iz CSV/PDF uvoza → izbjegnut duplikat)
   - **>1 kandidata ili nesiguran** → INSERT `bank_only` + `possible_duplicate_of` na najbliži (fallback)

---

## Faza 4 — UI badge (suptilno, dormant dok nema bank synca)

`TransactionListItem`:
- `pending_bank` → mali ⏳ icon uz iznos, tooltip "Čeka potvrdu banke"
- `confirmed` → ✅ uz iznos, tooltip "Potvrđeno bankom"
- `possible_duplicate_of != null` → suptilan badge "Možda duplikat", klik → bottom sheet "Spoji" / "Nisu isto"
- `manual`, `bank_only` → ništa

i18n (`src/i18n/locales/*`):
- `bankMatch.pending`, `bankMatch.confirmed`, `bankMatch.possibleDuplicate`, `bankMatch.merge`, `bankMatch.notSame`

---

## Što NIJE dirano

- Cash flow, balance updater, dashboard, izvještaji
- Personal/Business mode, business profile isolation
- `duplicateDetection.ts` (samo se reuse-aju tolerance konstante)
- Soft delete, trash flow
- Payment source format (`custom:UUID`)
- Receipt scanner flow

---

## Utjecaj na trenutni rad

| Scenarij | Status | Vidljiva promjena |
|---|---|---|
| Stare transakcije (backfill) | `manual` | nema |
| Ručni unos gotovine | `manual` | nema |
| Ručni unos kartice (nema banke) | `manual` | nema |
| Slikani račun / OCR | `manual` | nema |
| CSV uvoz izvoda | `bank_only` | nema |
| PDF uvoz izvoda | `bank_only` | nema |
| Recurring auto | `manual` | nema |
| Bank sync (sandbox ručni klik) | `bank_only` | nema (nema match kandidata) |

Dok netko ne spoji **pravu banku** + ručno unese karticu iz tog izvora, ⏳ badge se nikad ne pojavljuje. Match logika je dormant.

**Bonus:** Kad jednog dana spoji pravu banku, postojeći `bank_only` redovi iz CSV/PDF uvoza automatski se mogu upgrade-ati u `confirmed` (bez duplikata).

---

## Redoslijed implementacije

1. **F1** — Migracija (kolone + indeks)
2. **F2** — `bankMatchStatus.ts` helper + vitest
3. **F3a** — CSV/PDF eksplicitno `bank_only`
4. **F3b** — Ručni unos i OCR koriste helper
5. **F3c** — `bank-sync-transactions` match logika (0/1/N kandidata, search za `pending_bank` + `bank_only`)
6. **F4** — UI badge + "Možda duplikat" bottom sheet + i18n (HR/EN/DE)
7. Update mem: `hybrid-bank-match-model` + ažurirati `bank-sync-roadmap`

Bez native promjena → bez version bumpa.
