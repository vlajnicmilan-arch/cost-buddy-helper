## Cilj

Omogućiti **Pro korisnicima** (i u Personal i u Business modu) da koriste tab **Radnici** i **Dnevnik rada** na projektima. Trenutno je to zaključano samo na Business tarifu + aktivan Business mod, što neopravdano isključuje paušalne obrte i Pro korisnike koji vode projekte privatno.

## Tvoje odluke (potvrđene)

- **Pristup:** Pro i Business, u Personal i Business modu
- **Free korisnici:** tab potpuno sakriven
- **Workforce u tier sustavu:** moja preporuka ispod

## Preporuka za workforce/Business razgraničenje

| Feature | Tier | Obrazloženje |
|---|---|---|
| `workforce` (Radnici + Dnevnik rada) | **Pro** | Osnovna evidencija sati treba svim profesionalcima |
| `collaborators` (vanjski suradnici/podizvođači na projektu) | Business | Već je Business — multi-firma scenarij |
| `advanced_projects` | Business | Ostaje |
| `team_access` (više korisnika unutar firme) | Business | Ostaje |

**Razlog:** Radnici su **operativni alat** (vodi sate, plaća satnicu) — treba ga svaki paušalac. Suradnici su **B2B koncept** (ugovorna suradnja s drugom firmom/OIB-om) — to opravdano ostaje Business.

## Izmjene u kodu

### 1. `src/hooks/useFeatureAccess.ts`
Premjestiti `workforce` iz `business` u `pro`:
```ts
workforce: 'pro',  // bilo: 'business'
```

### 2. `src/components/projects/ProjectDetailDialog.tsx` (linija 64–70)
Razdvojiti gating za workers vs collaborators:
```ts
const isBusinessView = !!activeBusinessProfileId && project?.business_profile_id === activeBusinessProfileId;
const canSeeWorkers = hasAccess('workforce');           // Pro+ svuda
const canSeeCollaborators = isBusinessView && hasAccess('collaborators'); // Business + Business view

const canSeeTab = (tabKey: string) => {
  if (tabKey === 'workers' && !canSeeWorkers) return false;
  if (tabKey === 'collaborators' && !canSeeCollaborators) return false;
  return isManager || isTabVisible(tabKey);
};
```

### 3. Provjera ostalih ulaznih točaka
Pretražiti i uskladiti gdje god se renderira Workers tab/CTA:
- `src/components/projects/ProjectMembersTab.tsx` (default permissions matrix)
- bilo koji `hasAccess('workforce')` poziv
- BottomNav / projektne kartice — trebao bi raditi automatski

### 4. Free korisnik — sakrivanje
Već pokriveno: `hasAccess('workforce')` vraća `false` za Free, pa `canSeeTab('workers')` vraća false → tab se ne renderira. Bez dodatnog UpgradePrompt jer si izabrala "potpuno sakriti".

### 5. i18n
Bez novih stringova — postojeći `workers.*` ključevi već postoje na HR/EN/DE.

### 6. Test plan
- **Free korisnik** → otvori projekt → tab **Radnici** se NE vidi ✓
- **Pro u Personal modu** → otvori osobni projekt → tab **Radnici** se vidi, Dnevnik rada radi, Suradnici se NE vidi ✓
- **Pro u Business modu** → tab **Radnici** se vidi, Suradnici se NE vidi (treba Business) ✓
- **Business tarifa** → vidi i Radnike i Suradnike ✓

### 7. Memory update
Ažurirati `mem://features/dual-level-project-system` da reflektira novu Pro/Business podjelu tabova.

## Što se NE mijenja

- Baza podataka (project_workers, project_work_logs, project_work_entries) — ostaje kako jest
- Kod tabova (ProjectWorkersTab, WorkLogMonthlyOverview) — bez izmjena
- Business mod scoping (radnici i dalje vezani uz business_profile_id kad postoji)
- Postojeći podaci postojećih korisnika

## Rizici

Minimalni. Promjena je **proširenje pristupa** (više korisnika dobiva feature), ne restrikcija. Postojeći Business korisnici i dalje imaju sve. Postojeći Pro korisnici dobivaju novu mogućnost.
