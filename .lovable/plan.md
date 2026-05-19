# Faza A — Centralizacija duplicate detectiona + testovi

Bank-sync dio (DIO 3, 4, 6) i suspicious badge (DIO 5) odgađamo dok ne bude prave banke (sandbox = numeričke reference, nema smisla flagati duplikate). Ovaj plan pokriva DIO 1, 2, 7.

## Što ćemo dobiti

- **Jedan izvor istine** za prepoznavanje duplikata (helper modul).
- **Jasne razine** umjesto sadašnjeg 2/3 skoringa: `strict` / `fuzzy` / `suspicious` / `unique`.
- **Konzistentno ponašanje** u ručnom unosu, CSV-u i PDF-u (sva tri trenutno koriste različite kombinacije pravila).
- **Regresijski testovi** koji garantiraju da edge case "isti merchant + isti iznos + isti dan = SUSPICIOUS badge, ne duplikat".

## Razine (koje korisnik vidi)

| Razina | Confidence | Pravila |
|---|---|---|
| `strict` | 90–100 | isti payment_source_id + iznos ±0.01 + datum ±1 dan + merchant match (ili vrlo sličan opis) + isti type |
| `fuzzy` | 60–89 | isti iznos (±0.01) + isti type + datum ±3 dana + merchant ILI opis fuzzy match |
| `suspicious` | 30–59 | iznos ±5% + isti tjedan + merchant Levenshtein < 3 ILI opis preklapanje |
| `unique` | 0–29 | bez ostalog |

Edge case (odluka korisnika): **Konzum 50€ ujutro + Konzum 50€ navečer u istom danu = `suspicious`** (ne strict, ne fuzzy). Ručni unos zadržava postojeću strict zaštitu od dvoklika preko zasebnog poziva — vidi DIO 2.

## DIO 1 — `src/lib/duplicateDetection.ts`

Pure modul, bez React/Supabase importa.

```ts
export type DuplicateLevel = 'strict' | 'fuzzy' | 'suspicious' | 'unique';

export type DuplicateMatch = {
  level: DuplicateLevel;
  match: Expense | null;
  confidence: number;           // 0–100
  reason: string;               // i18n key, npr. 'duplicates.reason.sameAmountSameDay'
};

export type DetectOptions = {
  ignoreSameDayDuplicateGuard?: boolean; // CSV/PDF = true, ručni unos = false
  paymentSourceId?: string | null;
};

export function detectDuplicate(
  newTx: NewTxInput,
  existing: Expense[],
  options?: DetectOptions
): DuplicateMatch;
```

Helperi koji se ekstraktiraju iz `useExpenses.ts` (sada postoje kao closure):

- `normalizeMerchant(s)` — lowercase, trim, makni dijakritike, makni česte sufikse ("d.o.o.", "j.d.o.o.", "Zagreb", brojeve poslovnica).
- `areMerchantsSimilar(a, b)` — postojeća logika (substring + ≥50% zajedničkih riječi ≥3 znaka).
- `levenshtein(a, b)` — mala implementacija za suspicious razinu.
- `descriptionsOverlap(a, b)` — tokenizacija opisa, ≥60% preklapanje ili jedan sadrži drugog.
- `daysBetween(a, b)`.

`detectDuplicate` vraća **prvi najjači match** (sortira existing po confidence DESC i vraća najveći). `reason` je i18n ključ pa ga UI sloj formatira.

Postojeći `findDuplicates(transactions)` u `useExpenses.ts` postaje **tanki wrapper** koji za svaki tx zove `detectDuplicate` i razvrsta:
- `level === 'strict'` → `duplicates` (auto-skip, kao do sada)
- `level === 'fuzzy'` → `fuzzyDuplicates` (review dialog)
- `level === 'strict'` ali postojeća je auto-generated (`expense_nature: 'auto_recurring'`) → `autoGenMatches` (replace ponuda)
- ostalo → `unique`

`suspicious` razina u Fazi A **ne mijenja flow** (nema badge još, to je DIO 5). Ostavlja se hook za buduće: helper već vraća `suspicious`, ali wrapper ga tretira kao `unique` da ništa ne pukne.

## DIO 2 — Refaktor postojećih pozivatelja

- **`src/hooks/useExpenses.ts`** — ukloni `areMerchantsSimilar`, `scoreDuplicate`, inline pravila. `findDuplicates` i `checkDuplicate` zovu `detectDuplicate` iz lib-a. `checkDuplicate` (ručni unos) prosljeđuje `ignoreSameDayDuplicateGuard: false` → tretira "isti dan + isti iznos + isti merchant" kao `strict` (anti-dvoklik ostaje).
- **`src/components/CSVImportDialog.tsx`** — zamijeni inline "isti iznos + isti dan" detekciju (linije ~78-95) potpunim `findDuplicates` pozivom. Više nema dva paralelna puta.
- **`src/components/add-expense/AddExpenseDialog.tsx`** — `checkDuplicate` props i dalje vraća `Expense | null`, ali interno prima `DuplicateMatch`. `DuplicateWarningDialog` poziv dobiva cijeli match objekt (vidi sljedeću točku).
- **`src/components/DuplicateWarningDialog.tsx`** — promijeniti props iz `(existingExpense, newTransaction)` u `(match: DuplicateMatch, newTransaction)`. UI prikazuje `match.level` kao značku (Strict/Fuzzy) + lokalizirani `reason`. Side-by-side ostaje isti. Dodaju se i18n ključevi `duplicates.level.strict|fuzzy|suspicious` i `duplicates.reason.*`.

Bez promjene PDF parsera, edge funkcija, native verzije, DB migracija, version bumpa.

## DIO 7 — Testovi (`vitest`)

Novi `src/lib/duplicateDetection.test.ts` s minimalno:

1. **strict** — identičan iznos + isti payment_source + datum ±1 + isti merchant → `level === 'strict'`, confidence ≥ 90.
2. **fuzzy** — isti iznos, isti type, datum +3 dana, merchant fuzzy → `'fuzzy'`, confidence 60–89.
3. **suspicious** — iznos +3%, isti tjedan, merchant Levenshtein=2 → `'suspicious'`, confidence 30–59.
4. **unique** — različit iznos i merchant → `'unique'`, confidence < 30.
5. **edge case "Konzum 2x isti dan"** — dva identična txa istog dana s `ignoreSameDayDuplicateGuard: true` (CSV/PDF kontekst) → `'suspicious'`, NE `strict` i NE `fuzzy`. Potvrđuje da bulk import neće tiho preskočiti drugu kupnju.
6. **edge case ručni dvoklik** — isti slučaj s `ignoreSameDayDuplicateGuard: false` (ručni unos) → `'strict'`. Štiti od slučajnog dvostrukog spremanja.
7. **merchant normalizacija** — "Konzum d.o.o. Zagreb" vs "KONZUM ZAGREB 045" → match.
8. **različite poslovnice istog lanca + različit iznos** → `'unique'` (ne smije lažno spojiti).
9. **transfer ne matcha expense** — različit `type` nikad nije strict.

Wrapper `findDuplicates` (useExpenses) testovi nisu nužni — pokrivenost ide kroz pure helper.

CI gate (`.github/workflows/test.yml`) već postoji i pokriva nove testove automatski.

## Ne radimo u ovoj fazi

- DIO 3 — `bank-sync-transactions` edge funkcija (čeka pravu banku, sandbox = numeričke ref).
- DIO 4 — `/review-duplicates` stranica.
- DIO 5 — `is_suspicious_duplicate` kolona i badge u listi.
- DIO 6 — toast nakon sync-a.
- DB migracija (`potential_duplicate_of`, `is_suspicious_duplicate`).

Sve gore navedeno otključavamo u Fazi B kad bude live banka i kad helper bude provjeren u produkciji.

## Memory update nakon implementacije

Ažurirati `mem://features/transaction-duplicate-detection-v2` s novim modulom, razinama i edge case-om (Konzum istog dana = suspicious u importu, strict u ručnom unosu).
