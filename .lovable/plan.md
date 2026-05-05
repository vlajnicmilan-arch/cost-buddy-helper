## Bug 1: Pozivnice idu i na završene projekte

**Uzrok:** `supabase/functions/send-member-invitation/index.ts` ne provjerava status projekta. UI također ne sakriva formu kada je projekt `completed`/`cancelled`/`archived_at != null`.

**Popravak:**

1. **Edge function** — prije provjere postojećeg člana, za `type === "project"` dohvatiti `projects.status` i `archived_at`:
   - Ako `archived_at != null || status IN ('completed','cancelled')` → vratiti `400 { error: "project_closed", message: "..." }`.
2. **Frontend `ProjectMembersTab.tsx`** — primiti `projectStatus` i `archivedAt` propse. Kada je projekt zatvoren:
   - Sakriti cijelu "Invite section" (linije 295–451).
   - Prikazati `Alert`/info blok s ključem `projects.invitationsDisabledClosed`.
   - I dalje dopustiti listu članova, uklanjanje, promjenu uloga.
3. **`ProjectTeamTab.tsx`** — dodati `projectStatus` i `archivedAt` propse i proslijediti ih.
4. **`ProjectFullScreenView.tsx`** — proslijediti `project.status` i `project.archived_at` u `ProjectTeamTab`.
5. **`useProjectMembers.ts`** — `sendInviteEmail` već vraća error code; mapirati `'project_closed'` → friendly toast u `ProjectMembersTab.handleSendInvite`.
6. **i18n (hr/en/de)** — dodati pod `projects`:
   - `invitationsDisabledClosed`: "Projekt je završen ili arhiviran — pozivnice nisu moguće."
   - `projectClosed`: kratki toast za grešku.

## Bug 2: Gumbi (Uredi/Obriši/Arhiva) nevidljivi na kartici projekta

**Uzrok:** `ProjectCard.tsx` linija 254 — akcijski gumbi imaju `opacity-0 group-hover:opacity-100`. Na touch uređajima nema hovera; na desktopu su nedostupni dok korisnik ne pređe mišem precizno preko apsolutno pozicioniranog kontejnera. UX bug + a11y problem.

**Popravak:** Zamijeniti grupu hover gumba s **uvijek vidljivim kebab menijem** (Lucide `MoreVertical`) koji otvara `DropdownMenu` (shadcn, već se koristi u projektu — `ProjectDocumentsTab`, `ProjectWorkersTab`).

- Trigger: `Button variant="ghost" size="icon"` (44px touch target), pozicioniran `absolute top-2 right-2`.
- Menu items: Uredi · Arhiviraj/Vrati · Premjesti u poslovni mod (samo ako uvjeti) · Obriši (destruktivno).
- `e.stopPropagation()` na trigger i svaki item, da klik ne propagira na `onClick` kartice.
- Vidljivost samo za `project.isOwner` ostaje.
- i18n: reuse postojećih ključeva `projects.edit`, `projects.archive`, `projects.unarchive`, `projects.delete`, `projects.migrateToBusiness` (već koriste isti pattern).

## Datoteke

- `supabase/functions/send-member-invitation/index.ts` — provjera statusa
- `src/components/projects/ProjectMembersTab.tsx` — guard + handle `project_closed`
- `src/components/projects/ProjectTeamTab.tsx` — proslijediti propse
- `src/components/projects/ProjectFullScreenView.tsx` — proslijediti `project.status`/`archived_at`
- `src/components/projects/ProjectCard.tsx` — kebab dropdown umjesto hover gumba
- `src/i18n/locales/{hr,en,de}.json` — 2 nova ključa

## Bez

- DB migracije
- Promjena RLS
- Novih dependenciesa (DropdownMenu već postoji)
