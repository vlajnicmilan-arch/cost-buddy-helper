
# Plan: Skeniranje računa u poslovnom modu — opcija 2

Cilj: kad je korisnik u tvrtki i skenira račun, izvor plaćanja se ispravno bira (poslovni prvo), a ako se plati osobnom karticom — automatski nastaje pozajmica vlasnika prema tvrtki, jasno označena. Bez mijenjanja arhitekture transakcija (jedna transakcija ostaje na osobnoj strani, dug se vodi zasebno u BusinessDebtTracker).

## Što se mijenja

### 1. Pametan default izvora plaćanja u poslovnom modu
Datoteka: `src/components/AddExpenseDialog.tsx`

- Trenutno: u poslovnom modu auto-odabire `customPaymentSources[0]` (može biti osobni izvor).
- Novo: prvo traži izvor čiji `business_profile_id === effectiveBusinessProfileId`. Ako postoji → to je default. Ako ne → ostavi `paymentSource = 'cash'` (ne bira osobni automatski).
- Vrijedi i za manualni unos i za scan flow (nakon što scanner predloži izvor po zadnje 4 znamenke kartice — to već radi).

### 2. Validacija prije spremanja
Datoteka: `src/components/AddExpenseDialog.tsx`

- U poslovnom modu, ako korisnik ostavi `cash` a postoje poslovni izvori → blokiraj save i pokaži poruku (i18n).
- Ako nema niti jednog poslovnog izvora → dozvoli `cash` ili osobni (legitimno → nastaje pozajmica vlasnika).

### 3. Jasna vizualna oznaka "Pozajmica vlasnika"
Datoteka: `src/components/expense/PaymentSourceSelector.tsx`

- Kad je odabran osobni izvor u poslovnom kontekstu, ispod selektora prikazati statičan info-redak (i18n): "Bit će zabilježeno kao pozajmica vlasnika prema tvrtki."
- Bez nove logike — samo vizualni signal korisniku.

### 4. Badge "Pozajmica vlasnika" u BusinessDebtTracker listi
Datoteka: `src/components/business/BusinessDebtTracker.tsx` (provjeriti točan put)

- Osigurati da se zapisi koje generira `createOwnerLoanIfCrossMode` jasno prikazuju kao "Pozajmica vlasnika" s datumom, iznosom, opisom i izvorom (osobnom karticom).

### 5. i18n ključevi
Datoteke: `src/i18n/locales/hr.ts`, `en.ts`, `de.ts`

Novi ključevi pod `business.payment.*`:
- `requirePaymentSource` — "Odaberi poslovni izvor plaćanja prije spremanja."
- `willCreateOwnerLoan` — "Bit će zabilježeno kao pozajmica vlasnika prema tvrtki."
- `noBusinessSourcesHint` — "Nema poslovnih izvora plaćanja. Dodaj jedan u Postavkama."

## Što se NE mijenja

- `useExpenseCRUD` — već ispravno postavlja `business_profile_id` i poziva owner-loan logiku.
- `ownerLoanLogic.ts` — `createOwnerLoanIfCrossMode` već radi (kreira `business_debts` zapis).
- Filter dashboarda i nedavnih transakcija — ostaje kako je (transakcija pripada osobnom prikazu jer je plaćena osobnim izvorom; tvrtka je vidi kroz BusinessDebtTracker).
- DB schema, RLS, edge functions, migracije — ništa.

## Tehnički detalji

```text
Scan → Gemini AI prepoznaje merchant + iznos + zadnje 4 znamenke
     → CardLookup mapira znamenke na custom_payment_sources
     → AddExpenseDialog otvara se s pre-fill izvorom
     → Korisnik vizualno provjeri
     → Save:
        - poslovni izvor → expense (business_profile_id stamped) → vidljivo u tvrtki
        - osobni izvor → expense (osobno) + business_debts insert → tvrtka vidi kao pozajmicu
        - cash u biznisu bez poslovnih izvora → dozvoljeno (rijedak slučaj)
        - cash u biznisu sa poslovnim izvorima → blokirano s i18n porukom
```

Procjena: ~25 linija u AddExpenseDialog.tsx, ~6 linija u PaymentSourceSelector.tsx, ~3 linije u BusinessDebtTracker (badge), 9 i18n ključeva (3 × 3 jezika). Bez DB migracije.
