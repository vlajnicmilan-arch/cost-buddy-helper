

## Plan: Potrošnja iz stvarnih transakcija umjesto budžeta faza

### Problem
`ProjectDetailDialog` i `ProjectFullScreenView` računaju "potrošeno" kao zbroj budžeta završenih faza (`spentFromMilestones`), umjesto iz stvarnih transakcija. Hook `useProjectStats` već ima ispravnu kalkulaciju iz expenses tablice (`stats.totalSpent`), ali se ne koristi.

### Promjene

**3 datoteke, ista logika:**

#### 1. `src/components/projects/ProjectDetailDialog.tsx`
- Zamijeniti `spentFromMilestones` s `stats.totalSpent` za izračun `remaining`, `budgetUsedPercentage`, i prikaz potrošnje
- Label promijeniti iz "Završene faze" u "Potrošeno" (iz transakcija)

#### 2. `src/components/projects/ProjectFullScreenView.tsx`
- Zamijeniti `spentFromMilestones + collaboratorsPaid` s `stats.totalSpent` za `totalSpent`, `remaining`, `budgetUsedPercentage`
- Isti label update

#### 3. `src/components/projects/ProjectFundingTab.tsx`
- Koristiti `totalSpent` prop (iz stats) umjesto lokalnog izračuna iz milestone budžeta
- Dodati prop `totalSpent` u komponentu

#### 4. `src/components/business/BusinessProjects.tsx`
- U `fetchAllStats` zamijeniti logiku koja računa `spent` iz milestone budžeta — umjesto toga koristiti sumu approved expense transakcija iz expenses tablice

### Rezultat
"Potrošeno" će svugdje odražavati stvarne transakcije, a upozorenje o budžetu će se paliti samo kad stvarni troškovi prijeđu 90% primljenih sredstava.

