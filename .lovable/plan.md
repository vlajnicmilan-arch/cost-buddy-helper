## Problem (verificiran u kodu)

Trenutno `parse-pdf-statement` edge function NE prepoznaje notaciju `(n/m)` u Diners (i sličnim) izvodima. Za izvod od 788,10 €:

- AI vraća 4 rate (EMMEZETA 96,34 + EUROHERC 57,85 + Pandora 43,34 + Lesnina 45,89 + ostatak ako postoji) kao zasebne expense transakcije.
- Datum se postavlja na **datum originalne kupnje** (npr. 05.09.25), ne na mjesec naplate → mjesečni report pokazuje "potrošnju u rujnu" iako se naplaćuje u ožujku.
- Notacija `(6/7)` se gubi.
- Saldo se umanjuje za zbroj rata; ako korisnik dodatno unese cijelu naplatu 788,10 € sa žiro računa → **double counting**.
- Nema veze s ručno kreiranim `installment_plans`.

## Rješenje (3 faze)

### Faza A — Parser prepoznaje rate

Proširi `supabase/functions/parse-pdf-statement/index.ts`:

1. U tool schema (lines 274–315) dodaj polja:
   - `is_installment: boolean`
   - `installment_current: number | null` (npr. 6)
   - `installment_total: number | null` (npr. 7)
   - `installment_base_description: string | null` ("EMMEZETA" bez "(6/7)")
   - `due_date_override: string | null` — datum dospijeća iz zaglavlja izvoda (ovaj mjesec), za rate gdje je `date` retroaktivan
   - `is_statement_total: boolean` — true za zbirne retke "Specifikacija troškova na prodajnim mjestima - Diners Club (8881) 788,10 EUR"

2. U sistemskoj uputi (lines 200–221) dodaj sekciju:
   - "Ako description sadrži `(n/m)` ili `n od m`, postavi `is_installment=true`, ekstrahiraj brojeve, `installment_base_description` = opis bez zagrada."
   - "Za kartične izvode (Diners, Visa, Mastercard), datum knjiženja = datum dospijeća/naplate iz zaglavlja, ne datum originalne kupnje. Postavi `due_date_override` na datum naplate ovog mjeseca."
   - "Zbirni retci tipa 'Specifikacija troškova na prodajnim mjestima - [Card] (xxxx) [iznos] EUR' su sumarni totali — `is_statement_total=true`. NE ulaze kao expense."

### Faza B — Matching + booking logika

Novi helper `src/lib/installmentMatching.ts`:

```
matchInstallmentToPlan(parsedRow, existingPlans): {
  matched: boolean,
  plan_id?: uuid,
  installment_number?: number  // iz parsedRow.installment_current
}
```

Pravila:
- `parsedRow.installment_total === plan.installment_count`
- Normalizirani description (Levenshtein / unaccent / lowercase) — fuzzy match s `plan.description` (prag npr. 70%).
- Iznos rate unutar ±0.1% od `plan.total_amount / plan.installment_count`.

U `useExpenses.findDuplicates` (ili novi bucket `installmentLinks` u istom interfaceu kao `autoMergeMatches`):
- Za svaki PDF redak s `is_installment=true`:
  - Pokušaj match. Ako da → ulazi kao expense + naknadno `UPDATE installments SET expense_id=..., is_paid=true WHERE plan_id=... AND installment_number=...`.
  - Ako ne → ulazi kao običan expense + opis sadrži `(6/7)` + badge "Rata" u UI.
- Datum = `due_date_override` ako postoji, inače `date`.

Za `is_statement_total=true` retke:
- Ako postoji payment source koji matcha karticu iz totala (npr. Diners Club s last4 `8881`) → kreira se `transfer` s `income_source_id` = žiro, `payment_source` = `custom:DinersUUID`, type `transfer`. Saldo se umanjuje na žiro, povećava na Diners.
- Ako nema matching source → preskoči (parser ne knjiži), pokaži info u import dijalogu.

### Faza C — UI u Import dialog

U `GlobalPDFImportHost.tsx` i `CSVImportDialog.tsx`:
- Novi collapsible bucket "🔗 Rate povezane s planovima ({count})" — analogno postojećoj sekciji "Automatski spojeno s tvojim unosima".
- Svaki red: `EMMEZETA 6/7 — povezano s planom 'Kupnja Emmezeta' (7×96,34 €)`.
- Nepovezane rate: badge "Rata 6/7" žuto, info "Nije pronađen plan rata".
- Zbirni totali (`is_statement_total=true`): zasebna sekcija "💳 Naplata cijelog izvoda — knjižit će se kao transfer sa žiro računa".

i18n ključevi (HR/EN/DE):
- `import.installment.linkedTitle`, `import.installment.unlinkedBadge`
- `import.installment.linkedTo`, `import.installment.noPlanFound`
- `import.statementTotal.title`, `import.statementTotal.description`

## Tehnički detalji

**Baza** — bez novih kolona. Postojeće tablice dovoljne:
- `installments.expense_id` (FK) — već postoji, koristi se za linkanje.
- `installments` ima `installment_number` — popunjavamo iz `installment_current`.

**Test pokrivenost** (vitest, regresijski helperi):
- `src/lib/installmentMatching.test.ts` — fuzzy match, count match, amount tolerance.
- `src/lib/parsePdfHelpers.test.ts` (ako ne postoji) — parsing `(6/7)` notacije iz description-a.

**Bez promjena**:
- `useInstallments.createPlan` — ostaje isti.
- Datum migracija — nema (svi infrastructura postoji).
- Native — bez izmjena (sve edge function + frontend).

## Što izričito NE radimo

- Ne dodajemo automatsko kreiranje `installment_plan`-a iz PDF-a (samo linkanje na postojeće). Korisnik plan kreira ručno ili sa scanned receipta — kao i do sada.
- Ne diramo `parse-receipt` (POS skener već radi).
- Ne diramo `useBalanceUpdater` — saldo se ažurira normalno preko expense insert/update.

## Pitanje koje OSTAJE otvoreno

Za "ostatak" izvoda (Diners ima 4 vidljive rate na slici, ali total 788,10 € sugerira da ih ima više dolje) — parser će ih svejedno sve ekstrahirati ako ih AI vidi. Ako AI promaši neku, korisnik ručno doda. To je acceptable.

Treba li krenuti s implementacijom?
