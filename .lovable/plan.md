## Problem

U `Pregled budžeta` na otvorenom projektu, KPI "Ugovoreno" prikazuje samo `project.total_budget` (npr. 30 000), iako postoje aneksi koji su već bumpani u `project.contract_value` i prikazani kao mali "+iznos" badge ispod. Sve izvedene veličine (marža, % potrošnje, % naplate, alarmi) računaju se s istom (neefektivnom) bazom, pa korisniku stvaraju krivi dojam profitabilnosti i naplate.

`ProjectReportsDialog` i `ProjectEarnedValueCard` već koriste efektivnu ugovorenu vrijednost — Pregled budžeta je jedino mjesto koje to još ne radi.

## Cilj

Pregled budžeta računa s **efektivnom ugovorenom vrijednošću** = `contract_value` (s fallbackom na `total_budget`) + zbroj aneksa, identično kao izvještaji. Total_budget ostaje izvorno polje za "originalno planirano".

## Promjene

### `src/components/projects/ProjectFullScreenView.tsx`
- Dodati `useProjectContractAmendments(project.id)` (već postoji hook s `total`).
- Izvesti `effectiveContract = (project.contract_value || project.total_budget || 0) + amendmentsTotal`.
- Zamijeniti `budget` u svim računima KPI-blokova:
  - "Ugovoreno" KPI prikazuje `effectiveContract`
  - `marginPct`, `costPct`, `collectionPct`, `showBudgetAlarm`, `showCollectionAlarm` koriste `effectiveContract` umjesto `total_budget`
- `ContractAmendmentsBadge` ispod KPI-ja zadržati kao informaciju "od kojeg dijela je aneks" (npr. "uključuje +5 000 aneksa (1)") — radi transparentnosti, samo tekst se prilagodi.
- Loss-zone alarm (`useProjectLossZoneAlert`) već prima `contract_value || total_budget` — uskladiti i tamo da uključuje aneks.

### i18n
- Po potrebi novi key `projects.contractedIncludesAmendments` ("Uključuje aneks +{{amount}}") u `hr/en/de`.

### Što NE diramo
- `total_budget` ostaje kao "originalno planirani budžet" (za "Povijest budžeta" i revizije).
- `ProjectReportsDialog`, `ProjectEarnedValueCard`, `ProjectProfitLossCard` — već rade ispravno.
- Bez DB migracije.
- Bez promjene logike unosa aneksa u `ProjectMilestonesTab` / `MilestoneBudgetChangeSection`.

## Verifikacija
- Projekt s ugovorom 30 000 + aneks 5 000 → "Ugovoreno" pokazuje 35 000, marža/naplata/troškovni postoci se računaju s 35 000, alarmi (80% potrošnje, <50% naplate) okidaju na novoj bazi.
- Projekt bez aneksa → ponašanje identično kao prije.
- Brzi smoke test na `/projects` u oba moda (osobni/poslovni).
