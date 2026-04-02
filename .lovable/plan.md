

## Plan: Popravak podataka i migracije projekata

### Problem

Dva "Duje Grčić" projekta u bazi:
- Originalni (`01574b03`) — 166 transakcija, `business_profile_id: NULL`
- Duplikat (`32432484`) — 0 transakcija, ima `business_profile_id`

Migracija nije radila na originalu — umjesto toga stvoren je novi prazan projekt.

### Popravak

#### 1. SQL migracija — popraviti podatke
- Postaviti `business_profile_id` na originalni projekt (`01574b03`)
- Obrisati duplikat (`32432484`) koji nema podataka
- Ažurirati `business_profile_id` na svim expenses tog projekta

```sql
-- Migrate original project to business
UPDATE projects 
SET business_profile_id = '556acbc2-93a2-428c-9b93-7b147ad3b088'
WHERE id = '01574b03-61b4-4b8d-ad28-4a907d6a52ac';

-- Update related expenses
UPDATE expenses 
SET business_profile_id = '556acbc2-93a2-428c-9b93-7b147ad3b088'
WHERE project_id = '01574b03-61b4-4b8d-ad28-4a907d6a52ac'
AND business_profile_id IS NULL;

-- Delete empty duplicate
DELETE FROM projects 
WHERE id = '32432484-71ef-4c0a-997c-e55c723775ec';
```

#### 2. `useProjects.ts` — popraviti filtriranje osobnog moda
Osobni mod trenutno prikazuje **samo** projekte gdje `business_profile_id IS NULL`. Migrirani projekti nestaju iz osobnog pogleda.

Promjena: u osobnom modu prikazati **sve** projekte korisnika (uključujući migrirane), ali s osnovnim tabovima.

```typescript
// Osobni mod - prikaži SVE korisnikove projekte
if (!activeBusinessProfileId) {
  // Ne filtrirati po business_profile_id — prikaži sve
  // (business tabovi su ionako skriveni u osobnom modu)
}
```

Ovim korisnik uvijek vidi svoje projekte u osobnom modu, bez obzira jesu li migrirani ili ne. Razlika je samo u tabovima koji se prikazuju.

### Datoteke za izmjenu
- Nova SQL migracija (popravak podataka)
- `src/hooks/useProjects.ts` (filtriranje u osobnom modu)

### Rezultat
- Projekt "Duje Grčić" prikazuje svih 166 transakcija u poslovnom modu
- Nema duplikata
- Osobni mod i dalje vidi projekt, ali s osnovnim tabovima

