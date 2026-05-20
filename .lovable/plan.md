## Problem

Ponovni uvoz istog izvoda i dalje upisuje nove transakcije iako fingerprint dedup postoji. Provjera baze pokazuje **zašto**:

```
created_at 19:32 (stari batch): bank_transaction_id = NULL
created_at 04:41 (današnji):    bank_transaction_id = imp:248487...
```

**Sve transakcije uvezene prije nego što je fingerprint logika puštena u rad imaju `bank_transaction_id = NULL`.** ON CONFLICT na `(user_id, bank_transaction_id)` ih ne vidi (NULL ≠ NULL u unique indexu), pa svaki re-import izgleda kao "potpuno nov set".

Brojke iz baze (zadnja 2 dana):

| Batch | Mjesec | Cnt | Imao FP? |
|---|---|---|---|
| 904a2465, 77008c7f | Feb | 65 + 43 | NE |
| 1fb95869 (danas)   | Feb | 72       | DA, ali 0 preklapanja s NULL-ovima |
| 07d23036, 77fbe5e3, 660cf47a | Jan | 42+13+8 | NE |
| 9f89ea8b (danas)   | Jan | 44       | DA |

Dakle dedup logika u kodu **radi** (sve nove transakcije imaju FP), ali ne može matchat povijesne redove bez FP-a.

## Fix

### 1. SQL backfill (migracija)

Za sve `expenses` redove gdje je `import_batch_id IS NOT NULL AND bank_transaction_id IS NULL`, izračunati fingerprint istom formulom kao TS koristi:

```
imp:sha256(user_id|payment_source|YYYY-MM-DD|type|amount.toFixed(2)|normalized_text)
```

Normalizacija opisa (mora 1:1 matchati `src/lib/importFingerprint.ts`):
- lowercase
- NFD → strip diakritike (`unaccent` extension)
- collapse whitespace → single space
- trim
- fallback na `merchant_name` ako je opis prazan

SQL (skica):

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.expenses e SET bank_transaction_id =
  'imp:' || encode(digest(
    e.user_id::text || '|' ||
    COALESCE(e.payment_source,'') || '|' ||
    to_char(e.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '|' ||
    COALESCE(e.type::text,'') || '|' ||
    to_char(e.amount, 'FM9999999990.00') || '|' ||
    trim(regexp_replace(lower(unaccent(COALESCE(NULLIF(e.description,''), e.merchant_name, ''))), '\s+', ' ', 'g'))
  , 'sha256'), 'hex')
WHERE e.import_batch_id IS NOT NULL
  AND e.bank_transaction_id IS NULL;
```

Ako više starih redova generira isti fingerprint (true duplikati iz prijašnjih re-importa), zadržati najstariji i obrisati ostale prije UPDATE-a kako ne bi razbio unique index.

### 2. Čišćenje današnjih duplikata

Današnja 2 batcha (`1fb95869`, `9f89ea8b`) većinski su duplikati starijih NULL-FP redova. Nakon što backfill svim starijima dodijeli FP, današnji redovi s istim FP-om su pravi duplikati i mogu se brisati:

```sql
DELETE FROM expenses
 WHERE id IN (...rows from new batches whose FP already existed before created_at...);
```

Konkretno: za svaki par s istim `bank_transaction_id`, zadržati onaj sa starijim `created_at`. Saldo izvora plaćanja je ažuriran 2x → potrebna korekcija.

### 3. Korekcija salda izvora plaćanja

Za svaki izbrisani duplikat, revertirati efekt na saldo: `expense` vraća iznos, `income` oduzima. Najsigurnije ručno preko `updateBalance` per izvor (sumirati po `payment_source`).

Alternativno: skripta u browseru poziva isti `updateBalance` helper kao kod `bulkDelete`. Ali pošto je čišćenje jednokratno, najjednostavnije je u istoj migraciji izračunati delta po izvoru i pozvati `updateBalance` ručno kroz UI dialog "Korekcija salda" (jedan klik po izvoru).

## Što se NE mijenja

- `importFromCSV` logika
- `computeImportFingerprint` izračun
- Unique index `uniq_expenses_user_bank_tx`

## Verifikacija

1. Nakon migracije: `SELECT COUNT(*) FROM expenses WHERE import_batch_id IS NOT NULL AND bank_transaction_id IS NULL` → 0
2. Ponovni uvoz istog Feb PDF-a → "Nema novih transakcija — svih X već postoji."
3. Saldo izvora plaćanja odgovara ručnom zbroju.

## Pitanje za odluku

Za korak 3 (korekcija salda nakon brisanja duplikata):
- **A)** Ručno preko postojećeg "Korekcija salda" dijaloga (sigurno, 1 klik po izvoru)
- **B)** Automatski u istoj SQL migraciji preko UPDATE na `custom_payment_sources.current_balance` (brže, ali bypassa app-level logiku)

Preporučam A jer je RLS-sigurno i u skladu s postojećim flow-om.
