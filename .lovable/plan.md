

## Plan: Dva pogleda istog projekta + migracija

### Koncept

Jedan projekt u bazi, ali UI prikazuje različite tabove ovisno o kontekstu (osobni vs poslovni mod). Projekt s `business_profile_id` vidljiv je u **oba** moda — osobni vidi osnovne tabove, poslovni vidi sve. Osobni projekt (bez `business_profile_id`) može se "unaprijediti" u poslovni dodavanjem `business_profile_id`.

### Arhitektura

```text
┌──────────────────────────────────────────┐
│  PROJEKT (jedan zapis u bazi)            │
│  business_profile_id: NULL ili UUID      │
├──────────────────────────────────────────┤
│                                          │
│  OSOBNI POGLED (osobni mod):             │
│  Pregled | Timeline | Faze |             │
│  Financiranje | Tim | Transakcije        │
│                                          │
│  POSLOVNI POGLED (poslovni mod):         │
│  Sve gore + Radnici | Suradnici |        │
│  P&L kartica | Povijest budžeta          │
│                                          │
└──────────────────────────────────────────┘
```

### Promjene

#### 1. `src/types/project.ts`
- Dodati `business_profile_id?: string | null` u `Project` interface

#### 2. `src/hooks/useProjects.ts`
- Uvesti `activeBusinessProfileId` iz `AppStateContext`
- Filtriranje:
  - **Osobni mod** (`!activeBusinessProfileId`): prikaži projekte gdje `business_profile_id IS NULL` **ILI** je `NULL` (osobni) — svi projekti korisnika bez poslovnog filtera
  - **Poslovni mod** (`activeBusinessProfileId` aktivan): prikaži samo projekte s tim `business_profile_id`
- Kreiranje: automatski postavi `business_profile_id` ako je poslovni mod aktivan

#### 3. `src/components/projects/ProjectFullScreenView.tsx`
- Uvesti `useFeatureAccess` i `useAppState`
- Izračunati `isBusinessView` = `!!activeBusinessProfileId && project.business_profile_id === activeBusinessProfileId`
- Sakriti tabove Radnici, Suradnici, P&L karticu i Povijest budžeta kad `!isBusinessView` ili `!hasAccess('workforce')`
- Osobni pogled: Pregled, Timeline, Faze, Financiranje, Tim, Transakcije
- Poslovni pogled: sve gore + Radnici, Suradnici, P&L, Povijest budžeta

#### 4. `src/components/projects/ProjectDialog.tsx`
- Dodati opciju "Poveži s poslovnim profilom" — prikazuje se samo kad korisnik ima poslovni profil i Business tier
- Kod novog projekta u poslovnom modu, automatski popuniti `business_profile_id`

#### 5. `src/components/projects/ProjectsPanel.tsx`
- Dodati akciju "Premjesti u poslovni mod" na projektne kartice (kontekst menu ili dugme)
- Ova akcija samo postavi `business_profile_id` na aktivni profil, zadrži sve podatke
- Prikazuje se samo za osobne projekte (`!project.business_profile_id`) kad korisnik ima aktivan poslovni profil

#### 6. `src/components/projects/ProjectDetailDialog.tsx`
- Ista logika uvjetnih tabova kao u FullScreenView

### Migracija osobnog u poslovni

Akcija "Premjesti u poslovni mod":
1. Ažurira `business_profile_id` na projektu
2. Sve transakcije vezane uz taj `project_id` automatski dobivaju `business_profile_id` (batch update)
3. Projekt sada postaje vidljiv i u poslovnom modu s naprednim tabovima
4. U osobnom modu i dalje ostaje vidljiv, ali s osnovnim tabovima

### Datoteke za izmjenu
- `src/types/project.ts`
- `src/hooks/useProjects.ts`
- `src/components/projects/ProjectFullScreenView.tsx`
- `src/components/projects/ProjectDetailDialog.tsx`
- `src/components/projects/ProjectDialog.tsx`
- `src/components/projects/ProjectsPanel.tsx`

### Bez migracije baze
Stupac `business_profile_id` već postoji na tablici `projects`. Samo treba dodati logiku u frontend kod.

