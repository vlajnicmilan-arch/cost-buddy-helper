
# Plan: Slanje pozivnice radniku putem emaila

Trenutno postoji samo "Generate Invite Link" (kopiranje linka). Dodajemo opciju **slanja pozivnice mailom** direktno iz `ProjectWorkerDialog` — radi i za korisnike koji već imaju račun (in-app + push + email) i za one koji još nemaju (samo email s linkom).

## Što se mijenja

### 1. Novi email predložak (transakcijski)
Datoteka: `supabase/functions/_shared/transactional-email-templates/project-worker-invitation.tsx`
- Brand styling (teal HSL 172 66% 40%, bijela pozadina, Inter font, V&M Balance logo)
- Props: `inviterName`, `projectName`, `workerName?`, `inviteUrl`, `isNewUser` (true → tekst "Kreiraj račun i pridruži se", false → "Prihvati poziv")
- CTA gumb vodi na `inviteUrl` (`/join-project/<token>`)
- Subject: `"{inviterName} vas poziva na projekt {projectName}"`
- Registracija u `registry.ts` pod ključem `project-worker-invitation`

### 2. Proširenje `send-member-invitation` edge funkcije
Dodaje se ponašanje za `type === "project"` kad je u `body` poslan `workerId` i/ili `sendEmail: true`:

- **Ako korisnik s tim emailom postoji** → trenutno ponašanje (in-app notifikacija + push) **+ pošalji email** kroz `send-transactional-email` (template `project-worker-invitation`, `isNewUser: false`).
- **Ako korisnik NE postoji** (umjesto trenutnog 404 `user_not_found`):
  - Kreiraj invitation row direktno u `project_invitations` s:
    - `email = invitedEmail.toLowerCase()`
    - `invited_user_id = NULL`
    - `worker_id = <workerId>` (ako postoji)
    - `expires_at = +7 dana`
  - Pošalji email kroz `send-transactional-email` (`isNewUser: true`)
  - Vrati `{ success: true, mode: "email_only" }`
- `idempotencyKey` = `worker-invite-${invitation.id}`

Postojeća logika (provjera `already_member`, `already_invited`, kreiranje invitacije) ostaje za in-system korisnike.

### 3. UI: `ProjectWorkerDialog.tsx`
Pored postojećeg "Generate Invite Link" gumba dodajemo:
- Input `inviteEmail` (email validacija)
- Gumb **"Pošalji poziv mailom"** (Mail ikona)
- Loading state, success feedback preko `StatusFeedback` (1200 ms)
- Error handling preko `showError` + i18n (`errors.alreadyMember`, `errors.alreadyInvited`, `errors.invalidEmail`)
- Nakon uspješnog slanja: prikaži badge "Pozivnica poslana na {email}" + opcija ponovnog slanja

### 4. `accept-project-invitation` edge funkcija
Trenutno bi trebala već povezivati `worker_id`. Provjera: kad se prihvati invitacija s `invited_user_id = NULL` i `email` se podudara s prijavljenim korisnikom (ili novi korisnik nakon signupa), `worker_id` se i dalje uredno mapira na `project_workers.user_id`. Bez promjena ako već radi; minimalna nadopuna ako ne.

### 5. Hook `useProjectMembers.ts`
Nova metoda:
```
sendWorkerInviteEmail(workerId, email, role='member'): Promise<boolean>
```
poziva `supabase.functions.invoke('send-member-invitation', { body: { type: 'project', targetId: projectId, invitedEmail: email, role, workerId, sendEmail: true } })`.

### 6. i18n ključevi (`hr`, `en`, `de`)
Pod `projects.workerInvite`:
- `emailLabel`, `emailPlaceholder`
- `sendEmailButton` ("Pošalji poziv mailom")
- `emailSent` ("Pozivnica poslana na {email}")
- `userNotInSystemHint` ("Ako korisnik nema račun, dobit će email s pozivom za registraciju")

## Sigurnosni i tehnički aspekti
- Email se šalje preko postojeće Lovable Email infrastrukture (`notify.vmbalance.com` već verificiran).
- Idempotency ključ sprječava duplikate kod retry-a.
- Suppression check (postoji u `send-transactional-email`) automatski blokira slanje na bounceane/unsubscribed adrese.
- Email validation u UI + backend (zod-like u edge funkciji).
- RLS: invitacije s `invited_user_id = NULL` čita se po tokenu u `accept-project-invitation` (service role), tako da NULL invited_user_id ne lomi RLS.

## Toolchain
1. Migracija nije potrebna (sve kolone već postoje).
2. Deploy edge funkcija: `send-member-invitation`, `send-transactional-email` (jer se dodaje template).
3. Brand QA: nakon deploya pošalji test email sebi i provjeri render.

## Datoteke koje se mijenjaju / kreiraju
- **NEW** `supabase/functions/_shared/transactional-email-templates/project-worker-invitation.tsx`
- **EDIT** `supabase/functions/_shared/transactional-email-templates/registry.ts`
- **EDIT** `supabase/functions/send-member-invitation/index.ts`
- **EDIT** `src/components/projects/ProjectWorkerDialog.tsx`
- **EDIT** `src/hooks/useProjectMembers.ts`
- **EDIT** `src/i18n/locales/hr.json`, `en.json`, `de.json`

Reci ako želiš prilagodbe (npr. dodati custom poruku od managera u email, ili omogućiti slanje na više adresa odjednom) prije nego krenem implementirati.
