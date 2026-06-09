---
name: Projects Stabilization Status (P0 + F1–F6 + F8–F10 + Role Realign)
description: Status projektne stabilizacije nakon Option A realign (manager rola uklonjena). Tehnički zatvoreno, smoke testovi i dalje TODO prije produkcije.
type: feature
---

# Projects Stabilization — Status

> **NE označavati kao production-verified.** Sve faze su tehnički zatvorene (kod + 703/703 vitest), ali ručni smoke testovi nisu odrađeni.

## Status po fazama

### P0 — Core Financial Contamination
- **Status:** tehnički zatvoreno
- **TODO prije produkcije:** ručni smoke Milan (owner) / Petar (worker) — osobni Dashboard/Reports/Calendar/Search ne sadrži tuđe projektne transakcije; shared payment source transakcije i dalje dolaze.

### F1–F6 — Financial Sanitization
- **Status:** tehnički zatvoreno
- **TODO prije produkcije:** financial smoke na realnom projektu (advance + final invoice + transfer + correction + pending).

### F8–F10 — Permissions Hardening
- **Status:** tehnički zatvoreno
- **TODO prije produkcije:** RLS smoke s 4 stvarne role — Milan (owner), Petar (worker), Iva (member), Vera (viewer). Ana (manager) više ne postoji — vidi Role Realign.

### Role Realign (Option A) — manager rola uklonjena
- **Status:** tehnički zatvoreno (migracija 20260609034641 + 703/703 vitest)
- **Model nakon realigna:**
  - `owner` = `projects.user_id` (virtualna runtime rola, NIJE u `project_members`)
  - `member` = "Član" (operativan unos transakcija)
  - `worker` = "Radnik" (samo vlastiti work log)
  - `viewer` = "Promatrač" (read-only)
- **DB invariante:** `CHECK (role IN ('member','viewer','worker'))` na `project_members` i `project_invitations`. Trigger `add_project_owner_as_member_trigger` uklonjen. RLS politike koje su koristile `is_project_manager` migrirane na `is_project_owner`. Funkcija `is_project_manager` dropana.
- **Code invariante:** `ProjectRole = 'member'|'viewer'|'worker'`, `ProjectRoleKey = 'owner'|ProjectRole`. Owner se sintetizira u `useProjectMembers` (virtual row). `isManager` ostaje kao backwards-compat alias za `isOwner` u hooku — semantika identična.
- **Verifikacija (09.06.2026):** DB query potvrđuje 0 redova s `role='manager'`, postoje samo `member`/`worker`/`viewer`; CHECK constraints aktivni; postojeći projekti se učitavaju.

### Post-Option-A hotfixevi (09.06.2026)
- **Hotfix A — "Nepoznato" u Team tabu / work log autorima.** Root cause: globalna `profiles` SELECT policy je `auth.uid() = user_id`, pa klijent nije mogao čitati `display_name` drugih članova. Fix: uska SECURITY DEFINER funkcija `public.get_project_member_profiles(_project_id)` — vraća `(user_id, display_name)` za ownera + članove, samo ako je pozivatelj owner/član projekta. `EXECUTE` revokano od PUBLIC, dodijeljeno `authenticated` + `service_role`. `useProjectMembers` i `useProjectWorkLogs` koriste RPC umjesto direktnog selecta. Fallback ime kad profil postoji ali je prazan: `#<uid prefix>`, NIKAD "Nepoznato".
- **Hotfix B — worker ne može unijeti dnevnik rada.** Root cause: `ProjectWorkLogTab` je gasio "Novi zapis" preko coarse `isReadOnly` (true za svaki `participant`, uključujući worker/member). Fix v2 (09.06.2026): tab prima `canLogOwnWork` + zaseban `isOwnerReadonly` (billing downgrade). Worklog akcije koriste `canWorklog = canLogOwnWork && !isOwnerReadonly`; edit vlastitog = `isAuthor && canWorklog`; delete tuđeg = `isManager && !isReadOnly`. `ProjectFullScreenView` derivira permisije preko `deriveProjectPermissions({role, isOwner})` umjesto inline `isOwner || isManager`. `useProjectWriteGuard` + `isProjectWriteAllowed` imaju `allowOwnWorkLog` koji dopušta `participant` ali NE `owner_readonly`. Status: CODE/TEST/DB VERIFIED (707/707 vitest), UI SMOKE i PRODUCTION NEVERIFIED.
- **Ne dirano:** P0 filteri, F1–F6 financial sanitization, RLS na `project_*` tablicama, manager rola se NE vraća, globalna `profiles` policy ostaje uska.

## Out of scope (otvoreno)
- UI gate centralization kroz `useProjectRole()` — može ići sada kad je model poravnat, ali NE bez korisnikove odluke. **TODO unutar ovoga:** `WorkLogQuickEntry` (standalone wrapper izvan `ProjectWorkLogTab`) još uvijek koristi stari `allowOwnWorkLog` + coarse `isReadOnly` ulaz. Petrov primarni flow ide kroz `ProjectWorkLogTab` pa nije blocker, ali treba poravnati u UI gate centralizaciji.
- F11 invoices/estimates visibility — čeka odobrenje.
- Defense-in-depth RLS sweep (razdvajanje `is_project_member` od owner paths).
- "Voditelj"/co-manager kao UI rola — svjesno odbačeno (Option A). Ne uvoditi bez novog product odobrenja.
- Manager backwards-compat alias `isManager` u `useProjectMembers` — može se preimenovati u `isOwner` u kasnijem cleanup-u (čisto kozmetički, nema funkcionalnog utjecaja).

