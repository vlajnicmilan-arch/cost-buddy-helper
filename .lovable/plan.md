

# Plan: Poboljšana detekcija duplikata s "2 od 3" logikom + recurring zaštita

## Nova logika detekcije duplikata

Umjesto trenutnog pristupa (strogi match = sve mora biti isto, fuzzy = ±3 dana + isti iznos + slično ime), koristimo **scoring sustav s 3 kriterija**:

| Kriterij | Opis | Bodovi |
|----------|------|--------|
| **Iznos** | Isti iznos (±1%) i isti tip (expense/income) | 1 |
| **Datum** | Unutar ±5 dana | 1 |
| **Opis/Merchant** | Fuzzy match imena (podstring, word overlap ≥50%) | 1 |

- **3/3** → automatski preskočiti (sigurni duplikat)
- **2/3** → prikazati korisniku na provjeru ("Mogući duplikat")
- **1/3 ili manje** → unikatna transakcija, uvesti normalno

## Recurring auto-gen zaštita (Korak 2)

Kod uvoza bankovnog izvoda, dodatno provjeriti postojeće transakcije čiji `note` sadrži "ponavljajuća" ili "(auto)":

- Ako uvezena transakcija matchira auto-generiranu po 2/3 kriterija, ponuditi **zamjenu** umjesto duplikata
- Zamjena preuzima točniji opis i datum iz bankovnog izvoda, ali čuva vezu s recurring templateom

## Recurring matcher backward date (Korak 3)

U `useRecurringMatcher.ts`, kod usporedbe s recurring templateom, izračunati **prethodni** `next_due_date` (oduzimanjem frekvencije) i usporediti s datumom uvezene transakcije unutar ±5 dana. Ovo pokriva slučaj kad je template već pomaknut naprijed.

## Datoteke za promjenu

| Datoteka | Promjena |
|---|---|
| `src/hooks/useExpenses.ts` | Nova `findDuplicates` logika sa scoring sustavom 2/3 |
| `src/hooks/useExpenses.ts` | `checkDuplicate` isto prebaciti na scoring |
| `src/components/CSVImportDialog.tsx` | UI za prikaz auto-gen matcheva s opcijom zamjene |
| `src/hooks/useRecurringMatcher.ts` | Backward date matching za prethodni ciklus |
| `src/pages/Index.tsx` | `importWithRecurringCheck` — anti-duplicate provjera za auto-gen |

## Bez promjena u bazi

Sve se rješava na klijentskoj strani — nema novih migracija ni edge funkcija.

