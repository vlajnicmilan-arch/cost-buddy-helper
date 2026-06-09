# Cilj
Klik na 19h sažetak push (i odgovarajuću stavku u zvonu) otvori projekt na **Activity** tabu, s blagim pulse highlightom na kartici projekta. Bez novih sustava — samo dovršiti integraciju koja je ostala napola nakon prebacivanja na batch.

# Root cause (provjereno u kodu)

1. `supabase/functions/flush-participant-digest/index.ts` šalje push s:
   ```
   data: { type: "participant_digest", project_id, project_name, ... }
   ```
   **Nedostaju** `route`, `highlight_type`, `highlight_id`, `highlight_tab`.
2. `src/lib/notificationPayload.ts` `legacyResolve` **nema case** za `participant_digest` → vraća `{ route: null, highlight: null }`.
3. `useNotificationNavigation.navigateFromNotification` u tom slučaju samo prikaže "Stavka više nije dostupna" — ništa se ne otvara.
4. Digest se ne upisuje u `notifications` tablicu, pa u zvonu ne postoji sažetak-stavka (samo pojedinačne instant zvono-stavke, ali korisnik ne zna povezati push sa zvonom).

# Plan

## 1) Edge function: `flush-participant-digest/index.ts`
Pri slanju push-a, u `data` payload dodati standardne route + highlight fieldove (FCM flat string oblik koji `normalizePayload` već razumije):

```
data: {
  type: "participant_digest",
  category: "projects",
  project_id: project.id,
  project_name: project.name,
  project_icon: project.icon,
  project_color: project.color,
  event_count: count,
  route: `/projects?id=${project.id}`,
  fallback_route: "/projects",
  highlight_type: "project",
  highlight_id: project.id,
  highlight_tab: "activity",
}
```

Nakon uspješnog push-a, **upisati jednu zvono-stavku** u `notifications` tablicu da korisnik vidi sažetak i u zvonu (osim ako test mode), s istim `data` payloadom. Tip `participant_digest`, naslov i tekst identični push-u.

## 2) `src/lib/notificationPayload.ts`
U `legacyResolve` dodati case kao backup za stare zvono-stavke ili push bez `route` polja:

```ts
case 'participant_digest':
  return {
    route: projectId ? `/projects?id=${projectId}` : '/projects',
    fallback_route: '/projects',
    highlight: projectId
      ? { type: 'project', id: projectId, tab: 'activity' }
      : null,
  };
```

## 3) `HighlightType` union
Dodati `'participant_digest'` nije potrebno — koristimo postojeći `'project'` highlight. Bez schema promjena.

## 4) Verifikacija nakon implementacije
- Manualni trigger digest-a iz Settings test gumba → provjeriti payload u `push_delivery_logs` (sadrži `route`, `highlight_*`).
- Klik na push (web): otvori se `/projects`, `ProjectsPanel` čita `location.state.openProjectId` + `initialTab='activity'`, `HighlightTarget` pulse-a `[data-highlight-id="project:<id>"]` (marker već postoji na `ProjectCard`).
- Klik na zvono stavku tipa `participant_digest`: isti efekt preko `useNotificationNavigation`.
- Native push tap (Android): `nativePush.ts` već poziva `normalizePayload` i `setPendingHighlight` prije `window.location.replace` — radi automatski.

# Što NE radimo
- Bez novih tablica, bez schema migracija.
- Bez promjene digest cron rasporeda ili 19h logike.
- Bez novih highlight tipova — `project` + `activity` tab je dovoljan jer sažetak pokriva više raznih događaja.

# Memory update
Ažurirati `mem://features/notification-navigation-and-highlight` — dodati `participant_digest` u listu pokrivenih tipova i zabilježiti FCM payload contract koji edge funkcije moraju slati.
