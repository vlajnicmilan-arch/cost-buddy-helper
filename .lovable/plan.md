## Cilj

Bez pisanja novih testova: zabilježiti prioritetnu listu što treba pokriti, i dodati GitHub Actions korak koji gate-a build na padu postojećih testova.

---

## 1. Novi memory fajl: `mem://architecture/testing-priorities`

Sadržaj:

- **Trenutno stanje** (8 test fajlova, popis).
- **Visok prioritet** s kratkim razlogom *zašto* boli ako pukne:
  1. `transferMatching.ts` — krivi par = duplo računanje balansa.
  2. `paymentSourceMatching.ts` — card lookup po zadnje 4 znamenke; bug = transakcija na pogrešnom računu.
  3. `useRecurringMatcher` (0.1% tolerance, temp 0, backward date) — već postoji historijski bug.
  4. `useProjectProfitLoss` — dual-view cash vs accrual s contract fallbackom; ekstrahirati pure compute.
  5. `csvParsers.ts` — bankovni CSV import, format varijacije po banci.
- **Srednji prioritet:** `ownerLoanLogic.ts`, `dateValidation.ts` + `holidays.ts`, `useFreeLimits` / `useFeatureAccess`.
- **Eksplicitno NE testirati:** Deno edge functions (radije edge function logs), shadcn dialog/sheet render testovi (low ROI), Supabase chain mocking u hookovima (krhko).
- **Pravilo:** kad fix-aš bug u pure logici, prvo ekstrahiraj helper pa napiši regresijski test (kao kod `applyContractAmendment`).

Dodaje se i u `mem://index.md` pod Memories.

---

## 2. Ažurirati `mem://index.md` Core

Dodati jednu Core liniju:
- `Testovi: vitest. Prije release-a obavezno proći test suite (CI gate na PR-ovima). Novi pure helperi = novi unit test.`

---

## 3. Novi GitHub Actions workflow: `.github/workflows/test.yml`

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  vitest:
    name: Run vitest suite
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npm test
```

Napomene:
- `npm test` već postoji u `package.json` kao `vitest run` (verified).
- `--legacy-peer-deps` zato što tako i lokalno radiš (memory: Native Build).
- Trigger na `push: main` + svaki PR prema `main` + manual.
- Bez path filtera (testovi su brzi, ~3.5s lokalno).
- Workflow ne dira `android-build.yml` — to je odvojen pipeline.

---

## Što se NE radi u ovom planu

- Ne pišu se novi testovi za stavke s prioritetne liste — to je sljedeća iteracija po tvojoj odluci.
- Ne dira se postojeći `android-build.yml`.
- Bez izmjena `package.json` (test script već postoji).
- Bez native version bump-a (nema native promjene).

---

## Fajlovi koji se mijenjaju

1. **Novo:** `mem://architecture/testing-priorities` (memory fajl)
2. **Edit:** `mem://index.md` (Core linija + referenca na novi memory)
3. **Novo:** `.github/workflows/test.yml`

3 fajla, bez aplikacijskog koda.
