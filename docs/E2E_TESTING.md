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
- [ ] `mem://features/e2e-test-suite` entry
