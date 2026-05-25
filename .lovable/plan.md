
## Cilj

Korisnik s ulogom `worker` na nekom projektu mora moći:
- otvoriti taj projekt i voditi **Dnevnik rada** bez obzira na svoj pretplatnički plan (čak i besplatni)
- vidjeti samo **naziv + ikonu** projekta na kartici (bez Ugovoreno/Trošak/Zarada/marže/health dot-a)

Druge uloge (`member`, `viewer`, `manager`, vlasnik) ostaju nepromijenjene.

## Trenutno stanje (verificirano)

- `ProjectFullScreenView` već ima `isWorkerOnly = role === 'worker' && !isManager` koji skriva sve tabove osim `worklog` ✓
- `Projects.tsx` već dopušta worker/member pristup panelu bez paid plana preko `hasMemberships` ✓
- **Problem 1**: `ActiveProjectsStrip` na Početnoj radi `if (!hasAccess('projects')) return null` (linija 122) → worker na besplatnom planu nikad ne vidi strip, pa ne može doći do projekta s Početne
- **Problem 2**: `ActiveProjectsStrip` za sve projekte renderira `renderCenter()` (marža), `renderProgressBar()`, `renderFooterLines()` (Ugovoreno/Trošak/Zarada) → Petar trenutno vidi te brojke na "Duje Grčić"
- **Problem 3**: `ProjectCard` (lista u Projekti tabu) prikazuje budžet/progress/income/expense i za worker rolu

## Promjene

### 1. `src/components/home/ActiveProjectsStrip.tsx`

- Ukloniti hard gating `if (!hasAccess('projects')) return null`. Umjesto toga: ako nema `hasAccess('projects')`, prikaži **samo** kartice projekata gdje je user *non-owner* član (najčešće worker/member). Bez "Novi projekt" CTA i bez prazne pozivnice za free workere.
- Unutar mape: ako `project.role === 'worker' && !project.isOwner`, render **minimal varijanta** karte:
  - ikona + naziv + (bez health dot-a, bez marže, bez progress bara, bez 3 amount linija, bez status linije)
  - dimenzije i klik (`openProjectId`) ostaju iste radi konzistencije scroll-a

### 2. `src/components/projects/ProjectCard.tsx`

- Early-grana: kad je `project.role === 'worker' && !project.isOwner`, render čista kartica:
  - ikona + naziv (bez status badge, bez health badge, bez opisa, bez budžeta, bez income/expense, bez datuma, bez member countera, bez milestone countera, bez timeline bara, bez dropdown menija)
  - klik i dalje otvara projekt (`onClick(project)`) → `ProjectFullScreenView` → Dnevnik rada (već radi)

### 3. Provjera feature gatinga unutar projekta

- `ProjectFullScreenView` već ne dira `hasAccess('projects')` pri otvaranju, samo gating-a pojedine tabove. `worklog` tab nema `hasAccess` check → worker dolazi do njega bez paywall-a. **Bez promjene.**
- `ProjectWorkLogTab` — provjeriti da unutar njega nema `hasAccess('workforce')` koji bi sjekao free workera. Ako ima, ukloniti taj gate za worker rolu (RLS i tako čuva podatke).

## Što se NE radi

- Ne dira se DB, RLS, `user_roles`, ni feature flagovi
- Ne dira se onboarding/usage_profile (već radi: Petar je promijenio na "Koristim poslovno")
- Ne dira se `ProjectMembersTab`, `ProjectFullScreenView` worker tab gating
- Bez novih i18n ključeva

## Datoteke

- `src/components/home/ActiveProjectsStrip.tsx`
- `src/components/projects/ProjectCard.tsx`
- `src/components/projects/ProjectWorkLogTab.tsx` (samo provjera gatinga, eventualno ukloniti `hasAccess` ako blokira worker rolu)
