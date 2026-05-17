# Fix: "Naplata 105%" — pogrešna formula u Pregledu budžeta

## Problem

U `ProjectFullScreenView.tsx` koristimo:

```ts
const totalReceived = (stats.totalIncome || 0) + totalAllocated;
```

Dva problema:

1. **Dvostruko brojanje** — `useProjectFunding.totalAllocated` već zbraja i `project_funding.allocated_amount` **i** `incomeSources` (income transakcije iz `expenses`). Zbrajanjem s `stats.totalIncome` iste income transakcije ulaze 2×.
2. **Krivi koncept** — `project_funding` predstavlja **alokaciju izvora financiranja** (npr. "ovaj projekt se planira financirati iz wallet X"), a ne stvarnu uplatu klijenta. Korisnik je u pravu: naplata se računa **samo** kad klijent stvarno uplati.

## Fix

U `src/components/projects/ProjectFullScreenView.tsx`:

```ts
// prije
const totalReceived = (stats.totalIncome || 0) + totalAllocated;

// poslije — samo stvarne income transakcije na projektu
const totalReceived = stats.totalIncome || 0;
```

Time:
- "Naplata %" pada na realnu vrijednost
- "Primljeno" KPI prikazuje samo stvarno naplaćen novac
- Alarm "Naplaćeno samo X%" radi po stvarnoj logici

## Što ostaje netaknuto

- `useProjectFunding` se ne mijenja (koristi se u Money/Funding tabu za alokacije izvora — tamo ima smisla).
- `ActiveProjectsStrip` ne koristi income za maržu pa nije pogođen.
- Marža formula `(budget − spent) / budget` ostaje ista.
- Alarmi i progress barovi automatski koriste novi `totalReceived` jer ovise o njemu.

## Provjera konzistentnosti

`useActiveProjectsSummary` koristi `calculateProjectIncomeFromTransactions` (samo `expenses` tablica, bez funding) — to je ista logika kao novi fix. Konzistentno s home.
