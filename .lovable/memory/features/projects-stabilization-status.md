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

## Out of scope (otvoreno)
- UI gate centralization kroz `useProjectRole()` — može ići sada kad je model poravnat, ali NE bez korisnikove odluke.
- F11 invoices/estimates visibility — čeka odobrenje.
- Defense-in-depth RLS sweep (razdvajanje `is_project_member` od owner paths).
- "Voditelj"/co-manager kao UI rola — svjesno odbačeno (Option A). Ne uvoditi bez novog product odobrenja.
- Manager backwards-compat alias `isManager` u `useProjectMembers` — može se preimenovati u `isOwner` u kasnijem cleanup-u (čisto kozmetički, nema funkcionalnog utjecaja).
