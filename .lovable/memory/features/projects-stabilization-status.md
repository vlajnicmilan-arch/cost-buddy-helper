---
name: Projects Stabilization Status (P0 + F1–F6 + F8–F10)
description: Trenutni status projektne stabilizacije — sve tri faze tehnički zatvorene, ručni smoke testovi i role mapping audit ostaju TODO prije nastavka rada na permissions/UI gateovima i F11.
type: feature
---

# Projects Stabilization — Status

> **NE označavati kao production-verified.** Tri faze su tehnički zatvorene (kod + vitest), ali ručni smoke testovi nisu odrađeni i postoji otvoreni rizik oko mapiranja UI pojmova na backend role.

## Status po fazama

### P0 — Core Financial Contamination
- **Status:** tehnički zatvoreno
- **TODO prije produkcije:** ručni smoke Milan (owner) / Petar (worker) — provjera da osobni Dashboard/Reports/Calendar/Search ne sadrže tuđe projektne transakcije, i da shared payment source transakcije i dalje dolaze.
- Detalji: `mem://features/core-financial-contamination-p0`

### F1–F6 — Financial Sanitization
- **Status:** tehnički zatvoreno
- **TODO prije produkcije:** financial smoke na realnom projektu s advance + final invoice + transfer + correction + pending — provjera da ProjectBudgetTab / P&L / Forecast / Reports / Complete wizard pokazuju isti spent/income, da funding ostaje odvojen od income-a, i da invoice paid status broji samo approved income.

### F8–F10 — Permissions Hardening
- **Status:** tehnički zatvoreno (706/706 vitest)
- **TODO prije produkcije:** RLS smoke s 5 rola — Milan (owner), Ana (manager), Petar (worker), Iva (member), Vera (viewer). Provjera da worker/viewer ne mogu mijenjati radnike/satnice, da viewer ne unosi nikakve transakcije, da bivši član ne edita stare work logove, i da `project_member_permissions` ostaje owner-only.

## ⚠️ Blocker prije nastavka: Role Mapping Audit

Prije bilo kakvog daljnjeg rada na **UI gate centralization** ili **F11 (invoices/estimates visibility)** OBAVEZNO napraviti audit mapiranja UI pojmova ↔ backend rola.

**Razlog:** postoji mogući nesklad između termina koje korisnik vidi u UI-u (npr. "član", "promatrač", "radnik", "voditelj", "vlasnik") i kanonskih backend rola (`owner`, `manager`, `member`, `worker`, `viewer`). Ako mapiranje nije 1:1 i konzistentno kroz sve ekrane/i18n ključeve, centralizacija UI gateova kroz `useProjectRole()` zacementirat će postojeću zbrku umjesto da je riješi.

**Audit treba dati:**
1. Popis svih UI termina koji se koriste za role (HR/EN/DE) i gdje se pojavljuju.
2. Mapping tablica UI termin → backend rola (`owner|manager|member|worker|viewer`).
3. Popis mjesta gdje je mapiranje nejasno, dvosmisleno ili nedosljedno.
4. Odluka korisnika o kanonskim UI nazivima prije nego što ih centraliziramo.

**Do potvrde audita:** NE nastavljati s UI gate centralizacijom, NE krenuti u F11, NE mijenjati i18n ključeve vezane za role.

## Out of scope (otvoreno)
- Defense-in-depth RLS sweep (razdvajanje `is_project_member` od owner/manager paths).
- F11 invoices/estimates visibility (čeka role mapping + UI gate sweep).
- Worker model A/B/C strateška odluka.
