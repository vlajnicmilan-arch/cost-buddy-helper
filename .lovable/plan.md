
# Plan: VTR (Više traženih radova) kao vrsta faze

## Što gradimo

VTR je posebna vrsta faze (milestone) koja:
- Vizualno je odvojena (badge "VTR", ikona `FileSignature`, vlastita boja)
- Pri kreiranju **automatski** povećava `contract_value` projekta i kreira zapis u `project_contract_amendments` (isti mehanizam koji već koristi `scope_change`)
- Inače se ponaša kao obična faza: ima bud­žet, tro­škove, status, kanban poziciju, datume, dependencies

## Promjene

### 1. Baza (migracija)

```sql
ALTER TABLE public.project_milestones
  ADD COLUMN is_vtr BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_project_milestones_is_vtr 
  ON public.project_milestones(project_id) WHERE is_vtr = true;
```

Bez novih RLS pravila — koriste se postojeća za `project_milestones`.

### 2. Tipovi

`src/types/project.ts` → dodati `is_vtr?: boolean` u `ProjectMilestone`.

### 3. Hook `useProjectMilestones.ts`

Nova funkcija `createVtr(input)` koja u jednoj transakciji:
1. `INSERT` u `project_milestones` s `is_vtr=true`
2. `INSERT` u `project_contract_amendments` (amount = budget VTR-a, linked_milestone_id)
3. `UPDATE projects.contract_value += amount` (s baseline fallbackom kao u postojećoj `scope_change` logici, redak 282+)
4. Emit `contract-amendment-added` event (da `ContractAmendmentsBadge` refetcha)

Reuse postojeće logike iz `scope_change` grane — bez duplikacije.

### 4. UI — `ProjectMilestonesTab.tsx`

Pored postojećeg gumba **"Dodaj fazu"** dodati **"Dodaj VTR"** (varianta `outline`, ikona `FileSignature`). Otvara isti `MilestoneDialog` ali s prop `mode="vtr"`:
- Naslov "Novi VTR"
- Hint: "Iznos će biti dodan u ugovorenu vrijednost kao aneks"
- Submit zove `createVtr` umjesto `createMilestone`

### 5. Vizualna distinkcija

`MilestoneKanban.tsx` + lista:
- Badge "VTR" pored imena (Lucide `FileSignature`, primary/warning boja)
- Border-left ostaje boja milestonea, ali default boja za VTR = `hsl(var(--warning))`

### 6. Brisanje VTR-a

Pri brisanju VTR milestonea:
- Pronaći vezani `project_contract_amendments` zapis (po `linked_milestone_id`)
- Obrnuti `contract_value` (oduzeti amount)
- Obrisati amendment zapis
- Tek onda obrisati milestone

Ovo ide u isti hook (`deleteMilestone` već postoji — proširiti za VTR slučaj).

### 7. Edit VTR-a

Ako se mijenja `budget` postojećeg VTR-a → diff se primjenjuje na `contract_value` i ažurira amendment zapis. Drugi atributi (ime, datum, status) ne diraju aneks.

### 8. i18n

Novi ključevi (HR/EN/DE):
- `projects.milestones.addVtr` — "Dodaj VTR"
- `projects.milestones.vtrBadge` — "VTR"
- `projects.milestones.vtrHint` — "Iznos će biti dodan u ugovorenu vrijednost kao aneks"
- `projects.milestones.vtrDeleteWarning` — "Brisanjem VTR-a smanjit će se ugovorena vrijednost za {amount}"

### 9. Test

Vitest pure helper `applyVtrAmendment(currentContract, totalBudget, vtrAmount)` (po uzoru na postojeći `applyContractAmendment.test.ts`) — pokriti baseline fallback, brisanje (revert), edit (diff).

## Što NE diramo

- `contract_value` semantika ostaje ista (baseline + amandmani) — VTR samo dodaje još jedan izvor amandmana
- `useProjectProfitLoss`, `ProjectEarnedValueCard`, `ContractAmendmentsBadge` rade automatski (već čitaju `contract_value` + amendmente)
- Postojeći `scope_change` mehanizam ostaje netaknut (i dalje radi za korekcije bud­žeta postojećih faza); VTR je paralelan, namjenski tijek

## Tehnički sažetak

| Sloj | Datoteka | Promjena |
|------|----------|----------|
| DB | migracija | `+is_vtr` kolona |
| Types | `types/project.ts` | `+is_vtr?: boolean` |
| Hook | `useProjectMilestones.ts` | `+createVtr`, ext. `deleteMilestone`, ext. `updateMilestone` (budget diff) |
| Lib | `lib/applyVtrAmendment.ts` (+test) | pure helper |
| UI | `ProjectMilestonesTab.tsx` | "+Dodaj VTR" gumb |
| UI | `MilestoneDialog` | `mode="vtr"` prop |
| UI | `MilestoneKanban.tsx`, lista | VTR badge |
| i18n | `locales/{hr,en,de}.json` | 4 nova ključa |
