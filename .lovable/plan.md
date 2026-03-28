

# Plan: Granularne dozvole za članove projekta (Tab Visibility)

## Što se gradi

Voditelj projekta može za svakog člana odabrati koje kartice (tabove) taj član vidi. **Novi članovi po defaultu dobivaju samo obavezne tabove** (Pregled i Tim), a ostale tabove voditelj naknadno uključuje — bilo prilikom dodavanja člana, bilo kasnije.

## Tabovi i njihova pravila

| Tab key | Naziv | Obavezni? | Default za nove članove |
|---|---|---|---|
| `overview` | Pregled | Da (uvijek vidljiv) | ✅ |
| `members` | Tim | Da (uvijek vidljiv) | ✅ |
| `timeline` | Timeline | Ne | ❌ |
| `milestones` | Faze | Ne | ❌ |
| `workers` | Radnici | Ne | ❌ |
| `collaborators` | Suradnici | Ne | ❌ |
| `funding` | Financiranje | Ne | ❌ |
| `transactions` | Transakcije | Ne | ❌ |

Voditelj (manager) uvijek vidi sve — dozvole se ne primjenjuju na njega.

## Tehnički detalji

### 1. Nova tablica: `project_member_permissions`

```sql
CREATE TABLE public.project_member_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tab_key text NOT NULL,
  visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id, tab_key)
);

ALTER TABLE public.project_member_permissions ENABLE ROW LEVEL SECURITY;
```

RLS polise:
- Članovi čitaju svoje dozvole (`user_id = auth.uid()`)
- Voditelji čitaju/pišu sve dozvole u projektu (`is_project_owner`)

### 2. Novi hook: `useProjectMemberPermissions`

- `fetchPermissions(projectId, userId)` — dohvaća dozvole
- `updatePermissions(projectId, userId, tabs: Record<string, boolean>)` — upsert
- `initDefaultPermissions(projectId, userId)` — kreira zapise za sve neobavezne tabove s `visible = false`
- Logika: ako nema zapisa za tab → tab je **nevidljiv** (osim obaveznih `overview` i `members`)

### 3. Novi dijalog: `ProjectMemberPermissionsDialog`

- Otvara se klikom na Shield ikonu uz svakog člana (koji nije manager) na Members tabu
- Prikazuje checkboxeve za 6 neobaveznih tabova
- Obavezni tabovi (Pregled, Tim) prikazani ali disabled s kvačicom
- Sprema promjene upsertom u tablicu

### 4. Promjena u `ProjectMembersTab`

- Dodaje Shield gumb uz svaki redak člana (osim managera)
- Prilikom slanja pozivnice emailom ili generiranja linka, nakon što se član pridruži, automatski se kreiraju defaultne dozvole (sve neobavezne = false)

### 5. Promjena u `ProjectFullScreenView` i `ProjectDetailDialog`

- Dohvati dozvole trenutnog korisnika za projekt
- Ako korisnik **nije** manager: filtriraj TabsTrigger/TabsContent — prikazuj samo tabove gdje je `visible = true` + obavezne
- Ako **jest** manager: prikazuj sve
- Budget Overview sekcija na vrhu: sakrij ako korisnik nema pristup `funding` tabu

### 6. Auto-kreiranje dozvola pri pridruživanju

U `JoinProject` stranici i `accept-project-invitation` edge funkciji, nakon dodavanja člana u `project_members`, automatski insertati defaultne dozvole za 6 neobaveznih tabova s `visible = false`.

## Zahvaćene datoteke

| Datoteka | Promjena |
|---|---|
| Nova migracija | Tablica + RLS + trigger za updated_at |
| `src/hooks/useProjectMemberPermissions.ts` | Novi hook |
| `src/components/projects/ProjectMemberPermissionsDialog.tsx` | Novi dijalog |
| `src/components/projects/ProjectMembersTab.tsx` | Shield gumb |
| `src/components/projects/ProjectFullScreenView.tsx` | Filtriranje tabova |
| `src/components/projects/ProjectDetailDialog.tsx` | Filtriranje tabova |
| `src/pages/JoinProject.tsx` | Init defaultnih dozvola |
| `supabase/functions/accept-project-invitation/index.ts` | Init defaultnih dozvola |

