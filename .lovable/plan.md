

## Plan: Debug i popravak filtriranja izvora plaćanja u izvješćima

### Analiza

Pregledao sam cijeli tok podataka u `ReportsDialog.tsx`:
- `excludedPaymentSources` (Set) → `filteredExpenses` (useMemo) → `stats` (useMemo) → UI kartice

Logika je ispravno napisana — **ali** mogući problem je **neslaganje ID-ova**. Konkretno:

1. `uniquePaymentSources` gradi listu iz `customPaymentSources` (hook) koristeći `cs.id` (npr. UUID iz baze)
2. Ali transakcije (`expenses`) možda imaju `payment_source` postavljenu na drugi format (npr. `custom_ps_...` iz localStorage ili čak samo ime izvora)

### Rješenje

Dodati debug log u `togglePaymentSource` i `filteredExpenses` da se potvrdi hipoteza, te popraviti logiku ako se pokaže da je ID mismatch problem.

| Datoteka | Promjena |
|---|---|
| `src/components/reports/ReportsDialog.tsx` | 1) Dodati privremeni `console.log` u `filteredExpenses` useMemo koji ispisuje koliko je transakcija filtrirano i koji su excluded IDs vs. stvarni payment_source vrijednosti na transakcijama. 2) Ako se potvrdi mismatch, normalizirati ID-ove tako da `uniquePaymentSources` koristi iste ključeve kao `expense.payment_source`. |

### Alternativna hipoteza

Ako ID-ovi odgovaraju, problem bi mogao biti da korisnik ima transakcije s `payment_source = undefined` ili `null`, koje padaju na default `'cash'`, a `'cash'` izvor se ne prikazuje u listi (jer nema transakcija pod tim ključem ako korisnik koristi custom izvore).

### Pristup implementacije

1. Dodati console.log za debug (privremeno)
2. Identificirati stvarni uzrok
3. Popraviti logiku mapiranja ID-ova
4. Ukloniti debug logove

