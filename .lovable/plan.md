## Cilj

Kartice projekata na dashboardu i "Novi projekt" CTA trenutno samo navigiraju na `/projects` (lista). Korisnik mora još jednom kliknuti. Želimo da klik na karticu **odmah otvori taj projekt**, a klik na "Novi projekt" **odmah otvori dialog za novi projekt** — bez međukoraka.

## Princip — reuse postojećeg

`ProjectsPanel` već ima logiku koja sluša `location.state.openProjectId` i automatski otvara `ProjectFullScreenView` za taj projekt (vidi `src/components/projects/ProjectsPanel.tsx` linije 58-72). Iskoristit ćemo isti obrazac i za "novi projekt".

Dakle: **bez novih ruta, bez nove arhitekture** — samo proširujemo postojeći state pattern.

## Promjene

### 1. `src/components/home/ActiveProjectsStrip.tsx`

- `handleNav` proširiti da prima opcionalni `state` koji se proslijedi `navigate`.
- Klik na **karticu projekta**:  
  `handleNav('/projects', { openProjectId: project.id })`
- Klik na **"Novi projekt" CTA karticu**:  
  `handleNav('/projects', { openNewProject: true })`
- Klik na header **"Pogledaj sve"** ostaje običan `handleNav('/projects')` (lista).
- Empty state CTA "Kreiraj prvi projekt" (linija 217) → `handleNav('/projects', { openNewProject: true })`.

### 2. `src/components/projects/ProjectsPanel.tsx`

Postojeći `useEffect` (linije 58-72) koji čita `state.openProjectId` proširiti tako da:
- Ako je `state.openNewProject === true` → pozvati `handleOpenBlankDialog()` i očistiti history state.
- Postojeća grana za `openProjectId` ostaje netaknuta.

Tipiziranje state objekta proširiti: `{ openProjectId?: string; openExpenseId?: string; openNewProject?: boolean }`.

## Što se NE dira

- Ruta `/projects` ostaje ista — i dalje vodi na listu kad se otvori bez statea.
- `ProjectFullScreenView`, dialog za kreiranje, hooks — netaknuto.
- Nema novih query parametara u URL-u (state ide kroz React Router, ne URL).

## Edge slučajevi

- Ako projekt iz `openProjectId` više ne postoji (obrisan, arhiviran nije u `projects` listi) — postojeća logika tiho odustaje (`if (project)`), korisnik vidi listu. Ostavljamo to ponašanje.
- Native back gumb iz `ProjectFullScreenView`-a vraća na listu projekata (postojeće ponašanje), pa korisnik može lako prijeći na drugi projekt.

## QA

- Klik na karticu "Dujo" → odmah se otvori detalj Duje, bez liste.
- Klik na "Novi projekt" karticu → odmah se otvori dialog "Kreiraj projekt".
- Klik na "Pogledaj sve" u headeru → otvara se lista (kao i sada).
- Klik na "Kreiraj prvi projekt" u empty state → otvara dialog odmah.
