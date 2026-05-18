## Problem (verificirano u bazi)

Projekt "Duje Grčić" (`01574b03-61b4-4b8d-ad28-4a907d6a52ac`):
- `total_budget` = 30 000 € ✓
- `contract_value` = **3 040 €** ← krivo
- `project_contract_amendments`: 2 zapisa (2400 + 640 = 3040)

Originalni ugovor (30 000 €) nikad nije zapisan u `contract_value` jer je polje pri kreiranju projekta ostavljeno prazno. Korisnikov model: **contract_value = originalni ugovor + amandmani = 30 000 + 3 040 = 33 040 €**.

Posljedica: Earned Value, marža, EAC, Loss-Zone alert i P&L "Očekivano" krivo izračunati.

## Root cause u kodu

`src/hooks/useProjectMilestones.ts` (linije 252–268) kod dodavanja scope_change amandmana:
```ts
const currentContract = Number(proj.contract_value || 0);
const newContract = currentContract + amendmentAmount;
```
Kad je polazni `contract_value` `null`, baseline = 0 → amandmani se zbrajaju "u prazno".

Drugi nesklad: `ProjectEarnedValueCard.tsx` koristi `Number(project.contract_value || 0)` bez fallbacka na `total_budget`, iako hint u `ProjectDialog.tsx` (linija 363) tvrdi: *"Ako prazno, koristi se ukupan budžet kao očekivani prihod."*

## Plan popravka

### 1. Backfill projekta "Duje Grčić" (migracija)
```sql
UPDATE public.projects
SET contract_value = 33040
WHERE id = '01574b03-61b4-4b8d-ad28-4a907d6a52ac';
```
Amandmani u `project_contract_amendments` ostaju netaknuti (audit log).

### 2. Code fix — `src/hooks/useProjectMilestones.ts` (linije 252–268)

Prije zbrajanja amandmana, ako je `contract_value` `null` ili 0, koristiti `total_budget` kao baseline:
```ts
const cv = Number((projRow as any).contract_value || 0);
const tb = Number((projRow as any).total_budget || 0);
const baseline = cv > 0 ? cv : tb;
const newContract = baseline + amendmentAmount;
```
Tako amandmani uvijek imaju smislenu polaznu vrijednost.

### 3. Uskladiti UI fallback s hintom u dialogu

U sljedećim datotekama promijeniti `project.contract_value || 0` u `project.contract_value || project.total_budget || 0`:
- `src/components/projects/ProjectEarnedValueCard.tsx` (linija 23)
- `src/components/projects/ProjectCard.tsx` (linija 67 — proslijeđena vrijednost)
- `src/hooks/useProjectLossZoneAlert.ts` (linija 66)
- `src/hooks/useProjectProfitLoss.ts` (linija 82)

Time je prikaz "Ugovoreno" konzistentan s obećanim ponašanjem iz dijaloga, čak i kad korisnik ne popuni eksplicitno contract_value.

### 4. Memory zapis

Append u `mem://features/comprehensive-project-management`:
> `contract_value` semantika: originalni ugovor + svi `project_contract_amendments`. Kod (`useProjectMilestones`) i UI (`ProjectEarnedValueCard`, `ProjectCard`, `useProjectLossZoneAlert`, `useProjectProfitLoss`) moraju kao baseline koristiti `total_budget` kad `contract_value` nije eksplicitno postavljen, inače se amandmani zbrajaju na 0.

## Datoteke koje će se promijeniti

- `supabase/migrations/<timestamp>_backfill_project_duje_grcic_contract_value.sql`
- `src/hooks/useProjectMilestones.ts`
- `src/components/projects/ProjectEarnedValueCard.tsx`
- `src/components/projects/ProjectCard.tsx`
- `src/hooks/useProjectLossZoneAlert.ts`
- `src/hooks/useProjectProfitLoss.ts`
- `mem://features/comprehensive-project-management`

## Što NE radim

- Ne diram `project_contract_amendments` zapise.
- Ne mijenjam `total_budget` (ostaje 30 000 — to je interna planska brojka troška, ne ugovor).
- Ne mijenjam `ProjectDialog` hint — on je već točan.
- Ne mijenjam UI labele ni i18n.
