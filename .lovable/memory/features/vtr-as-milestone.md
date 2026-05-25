---
name: VTR (Više traženih radova) as Milestone
description: VTR je posebna vrsta faze (is_vtr=true) koja automatski kreira aneks ugovora i povećava contract_value
type: feature
---

## Model

VTR = `project_milestones` row s `is_vtr = true`. Ponaša se kao obična faza (budžet, troškovi, status, kanban), ali:

- **Pri kreiranju** (`createVtr` u `useProjectMilestones.ts`): atomski INSERT u `project_milestones` + INSERT u `project_contract_amendments` (linked_milestone_id) + bump `projects.contract_value` koristeći `applyContractAmendment` (baseline rule).
- **Pri brisanju** (`deleteMilestone` proširen): ako je `is_vtr`, prvo pronađe sve amendmente s `linked_milestone_id = id`, oduzme totalRevert od contract_value, obriše amendment redove, pa onda obriše milestone. Emit `contract-amendment-added` event s negativnim amount-om.
- **Edit**: VTR koristi isti `MilestoneBudgetChangeSection` mehanizam kao obične faze (scope_change + dodatni aneks).

## UI

- Dva gumba u `ProjectMilestonesTab.tsx`: outline "Dodaj VTR" (FileSignature ikona, warning boja) + primary "Dodaj fazu".
- VTR badge u listi i kanbanu (border-warning, ikona FileSignature).
- Sortiranje: contingency > VTR > obične faze.
- Confirm pri brisanju VTR-a uključuje upozorenje o smanjenju ugovora.

## DB

```sql
ALTER TABLE project_milestones ADD COLUMN is_vtr BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_project_milestones_is_vtr ON project_milestones(project_id) WHERE is_vtr = true;
```

Nema novih RLS-a — postojeće `project_milestones` policy-e pokrivaju VTR-ove.

## NE raditi

- Ne dirati `useProjectProfitLoss`, `ProjectEarnedValueCard`, `ContractAmendmentsBadge` — već čitaju `contract_value` i amendmente automatski.
- Ne kreirati posebnu tablicu za VTR — sve ide kroz `project_milestones` + `project_contract_amendments`.
- Default boja za VTR je `hsl(38 92% 50%)` (warning/orange).

## i18n

Svi ključevi pod `projects.vtr.*` u hr/en/de.
