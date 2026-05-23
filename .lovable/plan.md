## Što se mijenja

Sve promjene su u `src/components/projects/ProjectReportsDialog.tsx`, `src/lib/projectReportExport.ts` i i18n datotekama (`hr/en/de`). Bez DB migracije, bez nove logike.

### 1. Alert "Budžet prekoračen" → "Manjak naplate"

Trenutno `isOverBudget = (totalAllocated - totalSpent) < 0` uspoređuje **trošak vs primljeno**, a alert kaže "Budžet prekoračen". Faktografski netočno — pravi budžet nije prekoračen.

- Preimenovati varijable: `isOverBudget` → `hasCashflowGap`, `overBudgetAmount` → `cashflowGapAmount`.
- Novi i18n ključevi:
  - `projects.cashflowGapWarning` = "Manjak naplate"
  - `projects.cashflowGapDescription` = "Potrošnja premašuje primljena sredstva za"
  - `projects.cashflowGap` = "Manjak naplate" (kartica)
- Stari ključevi `projects.overBudgetWarning`, `projects.overBudgetDescription`, `projects.overBudget` ostaju (koriste se drugdje), ali se ovdje više ne referenciraju.

### 2. "Ukupni budžet" mora uključiti anekse

Trenutno kartica prikazuje `project.total_budget` (30.000 €). Pregled tab već prikazuje contract + aneksi (33.040 €) — nedosljedno.

- Dodati u dialog: `useProjectContractAmendments(project.id)` za sumu aneksa.
- Izračunati: `effectiveContract = (project.contract_value > 0 ? project.contract_value : project.total_budget) + amendmentsTotal`.
- Kartica "Ukupni proračun" prikazuje `effectiveContract`.
- Ako ima aneksa, ispod iznosa mali tekst: `+{formatAmount(amendmentsTotal)} ({count})` u istom stilu kao na Pregled tabu.
- U PDF/CSV exportu (`projectReportExport.ts`): `data.contractValue` se već prosljeđuje, ali iz Pregleda ide samo `contract_value` bez aneksa. Proširiti `ProjectReportData` da prima `contractAmendmentsTotal` (default 0) i koristiti `resolvedContract = contract_value + amendments` u `budgetData` redu "Ugovorena vrijednost".

### 3. Kartica "Završene faze" → "Potrošeno"

Prikazuje `totalSpent` (ukupni trošak), ne stvarnu vrijednost završenih faza. Label je kriv.

- Promijeniti `t('projects.completedPhases', ...)` u `t('projects.totalSpent', 'Potrošeno')` (postoji već u nekim mjestima — provjeriti i reusati).

### 4. i18n

Dodati nove ključeve u `src/i18n/locales/{hr,en,de}.json`:
- `projects.cashflowGapWarning`
- `projects.cashflowGapDescription`
- `projects.cashflowGap`
- (po potrebi) `projects.totalSpent` ako ne postoji

## Što se NE mijenja

- DB schema, RLS, edge funkcije — ništa.
- Logika izračuna `remaining`, `usedPercent`, milestone bar — nepromijenjeno.
- Pregled tab (prvi screenshot) — već radi ispravno, ne diramo.
- HTML print template, CSV/JSON struktura — samo label "Završene faze" ako se pojavljuje.
- Marža 30% vs 16.9% nedosljednost — izvan opsega (različite formule, raspravimo zasebno ako želiš).

## Datoteke

- `src/components/projects/ProjectReportsDialog.tsx` (label + alert + amendments hook + kartica iznos)
- `src/lib/projectReportExport.ts` (proširenje `ProjectReportData` s `contractAmendmentsTotal`)
- `src/components/projects/ProjectFundingTab.tsx` ili pozivatelj `ProjectReportsDialog`-a — proslijediti amendments ako je potrebno (najvjerojatnije se dohvaća unutar dialoga preko hooka, bez prop drillinga)
- `src/i18n/locales/hr.json`, `en.json`, `de.json`
