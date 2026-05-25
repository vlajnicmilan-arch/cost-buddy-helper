## Problem

Marža na kartici projekta na home dashboardu (npr. 25%) ne odgovara marži unutar projekta (npr. 32%). Formula je u oba slučaja ista — `(budget − spent) / budget` — ali se koristi **različit nazivnik**:

- **Home strip (`ActiveProjectsStrip.tsx` linija 101):** `budget = p.total_budget` (sirovi inicijalni budžet, BEZ aneksa i VTR-a)
- **Project full screen (`ProjectFullScreenView.tsx` linija 216):** `budget = effectiveContract` = `contract_value` (uključuje aneks/VTR), s fallbackom na `total_budget`

Kad postoji aneks ugovora ili VTR, `contract_value > total_budget`, pa je marža unutar projekta veća.

## Fix

Uskladiti home strip s istim "effective contract" izvorom istine koji se već koristi u `useProjectProfitLoss`, `ProjectFullScreenView` i helperu `calculateContractValue` (`src/lib/projectCalculations.ts`).

### Izmjena

**`src/components/home/ActiveProjectsStrip.tsx` (oko linije 101):**

```ts
// prije
const budget = p.total_budget || 0;

// poslije — koristi contract_value (uključuje aneks/VTR) s fallbackom na total_budget
const budget = calculateContractValue(p);
```

Import dodati iz `@/lib/projectCalculations`.

To je jedina semantička promjena. Formula marže ostaje ista, samo se nazivnik usklađuje s onim unutar projekta. Result: marža na kartici i unutar projekta će biti identična u svim slučajevima (s aneksom, VTR-om, ili bez).

### Verifikacija

- `p.total_budget` postoji na `Project` tipu i koristi se kao fallback u helperu, pa ništa ne puca.
- `health` traffic light koji se računa iz marže (`healthFromMargin`) automatski postaje konzistentan.
- Ne dira se backend, ne dira RLS, ne dira `useActiveProjectsSummary` (spent kalkulacija je već identična onoj u project view).

### Što se NE mijenja

- Spent formula — već je ista (`calculateProjectSpent`)
- Project view logika — ostaje izvor istine
- Ostale kartice/widgeti (ako postoje s drukčijim budžetom) — nisu u opsegu ovog requesta

## Files

- `src/components/home/ActiveProjectsStrip.tsx` — 1 import + 1 linija promjene
