## Provjera: nedostaje li workflow?

Da, korisnik je u pravu. U kodu trenutno postoji:

- **Status `completed`** — postavlja se ručno preko `ProjectDialog` Select polja (lako se preskoči)
- **Arhiviranje** — `archiveProject()` u `useProjects.ts`, gumb na `ProjectCard` (toggle)
- **Final report** — `ProjectReportsDialog` (PDF/CSV/JSON), ali nije vezan za zatvaranje projekta
- **Milestone status `completed`** — mijenja se po milestoneu u `ProjectMilestonesTab`

Ali **nigdje** ne postoji povezani workflow koji vodi korisnika kroz: "provjeri otvorene milestone-e → generiraj final report → označi projekt završenim → arhiviraj". To je upravo ono što mali biznis treba za zatvaranje obračuna.

## Što ćemo dodati

Novi **`CompleteProjectWizard`** dijalog (3 koraka), pristupačan iz `ProjectFullScreenView` headera kao primarna akcija "Završi projekt" (vidljiva samo kad `status !== 'completed'` i kad je korisnik manager/owner).

### Korak 1 — Provjera milestone-a
- Lista svih milestone-a koji **nisu** `completed` (pending / in_progress / overdue)
- Za svaki: checkbox "označi kao završen" (preselected za in_progress) + opcija "preskoči (ostaje otvoren)"
- Sažetak: `X od Y milestone-a završeno`, upozorenje ako ima `overdue`
- Ako korisnik označi → bulk update `project_milestones.status = 'completed'` + `completed_at = now()`

### Korak 2 — Final report
- Sažetak P&L-a iz `useProjectStats` + `useProjectProfitLoss` (budžet, potrošeno, alocirano, profit/loss)
- Dva CTA-a: **Generiraj PDF** i **Generiraj CSV** (reuse `generateProjectPDFReport` / `generateProjectCSVReport` iz `projectReportExport.ts`)
- Checkbox "Final report generiran" (mora biti čekiran ili eksplicitno preskočen prije nastavka)

### Korak 3 — Završetak i arhiva
- Polje "Datum završetka" (default: danas, upiše se u `projects.end_date` ako nije već postavljen)
- Opcionalna napomena (zaključci/lessons learned) → upiše se u `projects.description` kao append `\n\n--- Završeno DD.MM.YYYY ---\n{note}` (bez nove kolone)
- Dva radio izbora:
  - **Završi i zadrži aktivnim u listi** → `status = 'completed'`, `archived_at = null`
  - **Završi i arhiviraj** (preporučeno) → `status = 'completed'` + `archived_at = now()`
- Gumb "Završi projekt" → atomski update + `showSuccess` + zatvori wizard + zatvori `ProjectFullScreenView`

### Reverzibilnost
- Već postojeći "Vrati iz arhive" gumb na `ProjectCard` ostaje
- Dodat ćemo "Ponovo otvori" akciju u headeru `ProjectFullScreenView` kad je `status === 'completed'` (vraća na `active`, ne dira arhivu)

## Tehnički detalji

**Nove datoteke**
- `src/components/projects/CompleteProjectWizard.tsx` — glavni dijalog, 3 koraka kroz lokalni `step` state
- `src/components/projects/CompleteProjectStepMilestones.tsx`
- `src/components/projects/CompleteProjectStepReport.tsx`
- `src/components/projects/CompleteProjectStepFinalize.tsx`

**Izmjene**
- `src/components/projects/ProjectFullScreenView.tsx` — dodaj gumb "Završi projekt" u header (CheckCircle2 ikona), state `completeWizardOpen`, prosljeđuje `project`, `milestones`, `stats`. Dodaj "Ponovo otvori" za completed projekte.
- `src/hooks/useProjects.ts` — proširi `updateProject` ili dodaj `completeProject(id, { endDate, note, archive })` koji radi atomski update
- `src/i18n/locales/{hr,en,de}.json` — novi namespace `projects.complete.*` (title, steps, buttons, warnings, success)

**Bez DB migracije** — koristimo postojeće kolone: `projects.status`, `projects.archived_at`, `projects.end_date`, `projects.description`, `project_milestones.status`, `project_milestones.completed_at`.

**Reuse**
- `generateProjectPDFReport` / `generateProjectCSVReport` iz `src/lib/projectReportExport.ts`
- `useProjectStats`, `useProjectMilestones`, `useProjects.archiveProject` (interno preko novog `completeProject`)
- `StatusFeedback` (1200ms) za success poruke
- `useBackButton` za zatvaranje wizarda na Androidu

**A11y / dizajn**
- `clickableProps()` za sve interaktivne divove
- Min 44px touch targets
- Teal primary za primarne CTA-e
- Wizard koristi `Dialog` iz shadcn s `z-[60]` (postojeća konvencija)

## Što NE radimo

- Ne dodajemo novu DB kolonu za "lessons learned" (ide u `description` append) — može kasnije ako se traži pravi audit field
- Ne diramo `ProjectDialog` Select za status (ostaje za napredne korisnike koji žele ručnu kontrolu)
- Ne radimo automatsko slanje reporta članovima — ostaje ručni download (može u kasnijoj iteraciji)
