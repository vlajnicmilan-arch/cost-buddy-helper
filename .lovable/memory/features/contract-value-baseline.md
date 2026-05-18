---
name: Contract Value Baseline & Amendments
description: contract_value semantika - originalni ugovor + amandmani; total_budget fallback kad nije eksplicitno postavljen
type: feature
---

## Pravilo

`projects.contract_value` = originalni ugovorni iznos **+** zbroj svih `project_contract_amendments`.

Ako korisnik pri kreiranju projekta ne unese `contract_value` eksplicitno, UI ga prikazuje s fallbackom na `total_budget` (to je obećanje iz hint teksta u `ProjectDialog.tsx`: *"Ako prazno, koristi se ukupan budžet kao očekivani prihod."*).

## Implementacija

**Backend logika (`useProjectMilestones.ts`)** — kad scope_change milestone generira amandman:
```ts
const baseline = currentContract > 0 ? currentContract : totalBudget;
const newContract = baseline + amendmentAmount;
```
Bez ovog fallbacka, amandmani se zbrajaju na 0 i originalni ugovor se "izgubi" (bug iz svibnja 2026, projekt Duje Grčić: 30 000 → 3 040).

**UI fallback** — sve komponente koje prikazuju "Ugovoreno" / računaju EV/marže moraju koristiti:
```ts
project.contract_value || project.total_budget || 0
```

Datoteke koje već primjenjuju ovo pravilo:
- `src/components/projects/ProjectEarnedValueCard.tsx`
- `src/components/projects/ProjectCard.tsx` (prosljeđuje u `calculateProjectHealth`)
- `src/components/projects/ProjectFullScreenView.tsx` (prosljeđuje u `useProjectLossZoneAlert`)
- `src/hooks/useProjectProfitLoss.ts` (interni `resolvedContract`)

## NE raditi

- Ne mijenjati `total_budget` umjesto `contract_value` — to su dvije različite brojke (budget = planski trošak, contract = prihod od klijenta).
- Ne brisati `project_contract_amendments` zapise pri ispravkama — to je audit log.
