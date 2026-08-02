# E2E Testing (Sprint 2) — DEFERRED

> **Status: infrastruktura postavljena, nije aktivirana.**
> CI workflow je u `workflow_dispatch` modu (ne pokreće se na PR/push).
> Aktivacija zahtijeva GitHub repo secrets (vidi "Aktivacija" na dnu).
> Do tada zaštitu daju: vitest unit testovi + `PRE_LAUNCH_REGRESSION.md` ručna checklista.

Playwright + Chromium mobile (Pixel 5 viewport, 384px). Pokriva 5 kritičnih korisničkih tokova.


## Tokovi

| # | Tok | User |
|---|-----|------|
| 1 | Signup → Onboarding → Prvi trošak | `e2e+onboarding@vmbalance.com` |
| 2 | Ručni unos → soft delete → UNDO | `e2e+core@vmbalance.com` |
| 3 | Kreiraj budžet → trošak → burn % | `e2e+core@vmbalance.com` |
| 4 | Projekt (minimal): preset → milestone → done | `e2e+core@vmbalance.com` |
| 5 | CSV import + potvrda (bez merge/unmerge) | `e2e+import@vmbalance.com` |

## Lokalno pokretanje

```bash
# Env (npr. iz .env.e2e.local)
export E2E_SUPABASE_URL=...
export E2E_SUPABASE_ANON_KEY=...
export E2E_SUPABASE_SERVICE_ROLE_KEY=...
export E2E_USER_PASSWORD=...

bunx playwright install chromium
bunx playwright test
bunx playwright show-report
```

## Test data strategija

- 3 dedicirana usera (`e2e+...@vmbalance.com`) sa `profiles.is_e2e_user = true`
- `global-setup` osigurava postojanje + reset stanja
- `e2e_reset_user(p_user_id)` RPC briše scope-ane podatke; **zahtijeva `is_e2e_user = true` AND email pattern match** (defense in depth)
- RPC dostupan samo `service_role` (klijent/anon/authenticated nemaju EXECUTE)

## Cleanup strategija

- `beforeEach` u svakom flow-u zove `resetUserByKey()`
- `global-teardown` best-effort reset (ne ruši run ako zafali)

## Auth strategija

- Programatski login preko `/auth/v1/token` u `global-setup`
- Session se persist-a u `storageState` po useru, testovi ga reuse-aju kroz `test.use({ storageState })`
- Flow 1 (signup) intentionally ne koristi storageState

## CI strategija

- `.github/workflows/e2e.yml` na PR-ovima i push na `main`
- Chromium only, 2 workera, 2× retry, 10 min job timeout
- Reportovi uploadani kao artifact (14d retencija)
- Secreti: `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_USER_PASSWORD`

## Što NE testiramo u Sprint 2 (i zašto)

- **OCR/AI Insights** — non-deterministic, vanjski API trošak
- **Krug** — multi-user flow, kompleksan setup, izvan top 5 ROI
- **Android/Capacitor native** — zahtijeva emulator infra
- **Visual regression** — diff noise, nije ROI prioritet
- **Stripe checkout** — vanjski 3rd-party
- **Email delivery** — vanjski 3rd-party
- **Project completion wizard / reopen / readonly gate** — pokriveno ručnim PRE_LAUNCH_REGRESSION; ulazi u E2E tek na pravi signal
- **Manual ↔ bank merge/unmerge** — pokriveno s 20+ vitest testova, doda flake risk

## Data-testid plan

Selektori centralizirani u `e2e/helpers/selectors.ts`. Sprint 2 zahtijeva dodavanje `data-testid` atributa u source komponentama (zato su spec-ovi trenutno `test.skip` — uklanjaju se kako se atributi adaju).

## Definition of Done

- [x] Infrastructure: `playwright.config.ts`, global setup/teardown, helpers
- [x] `e2e_reset_user` RPC + `profiles.is_e2e_user` flag deployani
- [x] `.github/workflows/e2e.yml` postoji
- [ ] 5 spec fajlova prolaze (skip flagovi maknuti)
- [ ] 3 dana zaredom svi flow zeleni
- [ ] Flake rate < 2%
- [ ] p95 trajanje < 6 min
- [x] `docs/E2E_TESTING.md`
- [ ] `PRE_LAUNCH_REGRESSION.md` updated

---

## Aktivacija (kasnije)

### Odakle stvarno dolaze kredencijali

| Varijabla | Je li tajna | Gdje se nalazi |
| --- | --- | --- |
| `E2E_SUPABASE_URL` | ne | Već u repozitoriju (`.env`, `security-audit.yml` ima fallback). Ne treba je nigdje tražiti. |
| `E2E_SUPABASE_ANON_KEY` | ne | Publishable ključ; već u repozitoriju i u `security-audit.yml` fallbacku. |
| `E2E_USER_PASSWORD` | da, ali je izmišljena | Korisnik je sam smisli (bilo koji jak string). Nema je nigdje za "pronaći". |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | DA | **Lovable Cloud ovaj ključ NE prikazuje.** Nema ga u Lovable sučelju, ni u Backend pregledu, ni u postavkama projekta. |

**Ispravak ranije netočne upute:** prethodna verzija ovog dokumenta tvrdila je da
se service_role ključ nalazi u „Lovable Cloud → Backend → API keys". To nije
točno i ne treba ga ondje tražiti. Ključ je dostupan isključivo vlasniku
pravog Supabase projekta (Supabase dashboard → Project Settings → API), a
projekti na Lovable Cloudu nemaju pristup tom dashboardu.

Dakle: jedini secret koji stvarno nedostaje je `E2E_SUPABASE_SERVICE_ROLE_KEY`.

### Dok tog ključa nema

Sigurnosna provjera prava pisanja po ulogama vozi se kroz **SQL harness**, koji
ne treba nijedan secret:

- `supabase/tests/security/role_write_baseline.sql` — snimka žive sheme
- `supabase/tests/security/role_write_matrix.sql` — matrica prava (RLS + trigeri)
- pokreće se u `.github/workflows/balance-sql-suite.yml` nad praznim Postgresom
- redoslijed koraka je bitan: `role_write_baseline.sql` → `secdef_anon_shim.sql`
  → `role_write_matrix.sql` → `secdef_anon_invariant.sql` (shim mora doći nakon
  baselinea, inače njegove SECDEF funkcije ostanu anon-izvršive)
- trenutni obuhvat: **87 provjera** (koraci D, D2 i E)

Korak E (troškovi na potvrdu) pokriven je provjerama 68–82: tko smije upisati
`pending`/`approved` trošak, da polja pregleda mijenja isključivo
`review_project_expense`, i tko smije taj RPC pozvati. Utjecaj `pending`/
`rejected` troškova na saldo NIJE u ovom paketu — dokazuju ga scenariji E1–E6 u
`supabase/tests/balance/10_scenarios.sql`.

Granice te zamjene (JWT/GoTrue, PostgREST sloj, edge funkcije, drift prema
produkciji) popisane su u zaglavlju `role_write_matrix.sql`.


Playwright specovi u `e2e/security/` ostaju u repozitoriju netaknuti i prorade
bez ijedne izmjene čim `E2E_SUPABASE_SERVICE_ROLE_KEY` postane dostupan.

### Kad ključ postane dostupan

1. U GitHub repu → **Settings → Secrets and variables → Actions → New repository secret** dodaj:
   - `E2E_SUPABASE_SERVICE_ROLE_KEY` = service_role ključ iz Supabase dashboarda
   - `E2E_USER_PASSWORD` = bilo koji jak string koji sam smisliš
   - (`E2E_SUPABASE_URL` i `E2E_SUPABASE_ANON_KEY` su neobavezni — postoje fallbacki)
2. U `.github/workflows/e2e.yml` zamijeni `on: workflow_dispatch:` blok s originalnim trigerima (`pull_request` + `push: main`).
3. Dodaj `data-testid` atribute za preostale flowove (Flow 2 ih već ima).
4. Ukloni `test.skip` iz spec fajlova jedan po jedan.


- [ ] `mem://features/e2e-test-suite` entry
