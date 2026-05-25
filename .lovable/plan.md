## Cilj

Dnevnik rada izvući iz Activity taba (Work grupa) i postaviti kao **zaseban tab "Dnevnik rada" u People grupi**, pored "Tim projekta". Activity tab ostaje samo feed (bez toggle-a).

## Promjene u `src/components/projects/ProjectFullScreenView.tsx`

### 1. People grupa — dodati drugi tab
U bloku `{activeGroup === 'people' && (...)}` (oko linije 598-613) dodati drugi `TabsTrigger value="worklog"`:

- Ikona: `BookOpen`
- Label: `t('workLog.tab', 'Dnevnik rada')`
- Tooltip s objašnjenjem da prikazuje upisane sate radnika

Gate vidljivost: `canSeeTab('worklog')` → vraća `true` samo ako (a) projekt ima ≥1 radnika (`workers.length > 0` iz `useProjectWorkers`), ili (b) `isWorkerOnly`. Bez radnika tab se ne pojavljuje da ne zatrpava ekipi koja nema radnike.

### 2. Activity tab — ukloniti dualni toggle
Blok `<TabsContent value="activity">` (linije 775-805) pojednostaviti:
- Maknuti toggle `worklog` ↔ `activity`
- Renderira se samo `<ProjectActivityTab projectId={project.id} />`
- Maknuti `activityView` state (linija 81) i useEffect za `activityView` (liniju 176-178)

### 3. Worklog TabsContent — proširiti na sve uloge
Trenutni `{isWorkerOnly && <TabsContent value="worklog">}` (linije 807-812) ukloniti gate `isWorkerOnly` — sad i menadžer ima isti `value="worklog"` tab. Jedan render za sve:
```tsx
{(canSeeTab('worklog')) && (
  <TabsContent value="worklog" className="m-0">
    <ProjectWorkLogTab projectId={project.id} isManager={isManager} projectName={project.name} />
  </TabsContent>
)}
```

### 4. Mapiranja — uskladiti
- `TAB_TO_GROUP` (linija 144-159): `worklog: 'people'` (umjesto trenutnog ponašanja gdje resolver šalje worklog u activity)
- `resolvedActiveTab` (linija 162-167): ukloniti pravilo `if (activeTab === 'worklog' && !isWorkerOnly) return 'activity'`. Worklog je sad pravi tab.
- `canSeeTab` (linija 122-130): dodati gate za `worklog` (vidi #1)

### 5. Default tab za menadžera
Trenutno `setActiveTab(isWorkerOnly ? 'worklog' : 'phases')` — ostaje isto. Menadžer i dalje ulazi u Phases (Work grupa). Bez promjene defaulta.

### 6. Tooltipovi za People grupu
Postojeći tooltip za "Tim projekta" zadržati. Dodati zasebni kratki tooltip za "Dnevnik rada".

## i18n (`src/i18n/locales/{hr,en,de}.json`)

Provjeriti postoje li ključevi; dodati ako fale:
- `workLog.tab` — "Dnevnik rada" / "Work log" / "Arbeitstagebuch" (već postoji, ali vrijednost je trenutno samo "Dnevnik")
- `projects.tooltips.workLog` — kratak opis ("Upisani sati radnika po danima i obračun isplata.")

## Što NE diramo

- `ProjectWorkLogTab.tsx` — komponenta ostaje identična, samo se renderira iz drugog mjesta.
- Worker-only ponašanje — radnik i dalje automatski upada u `worklog` tab, sad samo unutar People grupe.
- Activity feed (`ProjectActivityTab`) — ostaje, samo bez podijeljenog prostora.
- Bez DB migracija, bez RLS, bez novih hookova.

## Edge cases

- **Projekt bez radnika:** Dnevnik tab se sakriva u People grupi → menadžer vidi samo "Tim projekta". Ako naknadno doda radnika → tab se pojavljuje (React re-render preko `useProjectWorkers`).
- **Legacy deep links** (`initialTab='worklog'` iz vanjskih mjesta, npr. ActiveProjectsStrip): radi se ispravno jer worklog sad postoji kao pravi tab; TAB_TO_GROUP automatski prebacuje na People grupu.
- **`isManager` flag** prosljeđuje se nepromijenjeno (`ProjectWorkLogTab` ga već koristi za prikaz `MyWorkerPayCard` vs ostalo).
