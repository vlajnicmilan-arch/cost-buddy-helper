---
name: Balance Regression Testing Policy
description: Vitest mirror + SQL harness gate za balance engine; curated baseline umjesto full migration replay
type: preference
---

## Deploy gate (nepromjenjivo)

Nijedan deploy koji dira balance logiku (trigger `_expenses_recompute_source_balance`,
funkcija `recompute_custom_source_balance`, writer intent, anchor semantika,
migracije nad `expenses` / `custom_payment_sources` / `app_settings`) NE IDE
bez ZELENE SQL suite. Vitest zelen NIJE dovoljan — istina živi u PG
funkcijama, ne u TypeScript mirroru.

**Why:** Vitest suite (`src/lib/balance/__tests__/balanceRegression.test.ts`)
štiti mirror od dnevnih regresija u UI/logici. SQL suite
(`supabase/tests/balance/`) štiti PRAVE trigger/recompute funkcije od
regresija u migracijama.

## Suite arhitektura

- **Vitest:** 17 scenarija na `balanceEngineMirror.ts`. Trči kroz `npm test`.
- **SQL suite:** 17 scenarija (24 assertiona) protiv stvarnih PG funkcija.
  Trči kroz `.github/workflows/balance-sql-suite.yml`.

## CI arhitektura — curated baseline (odluka 2026-07-07)

Puna povijest migracija **nije** linearno replayabilna na čistom `postgres:16`:
- Nedostaju Supabase interni artefakti (`storage.foldername`, `supabase_realtime` publikacija).
- Postoje inter-migracijski konflikti (npr. `projects` se ponovno stvara u kasnijoj migraciji bez `IF NOT EXISTS`) — puni replay padne unutar prvih 30 migracija.

**Rješenje:** curated baseline umjesto full replay.

1. `supabase/tests/balance/bootstrap.sql` — Supabase stubovi (auth/storage/role).
2. `supabase/tests/balance/baseline.sql` — minimalna shema `expenses` + `custom_payment_sources` + `app_settings` s pre-anchor stupcima.
3. `supabase/tests/balance/BALANCE_MIGRATIONS.txt` — whitelist balance-relevantnih migracija (trenutno 7).
4. `supabase/tests/balance/BALANCE_MIGRATIONS_IGNORE.txt` — override za balance-neutralne izmjene.
5. `supabase/tests/balance/detect-drift.sh` — STROG fail ako PR mijenja balance-relevantnu tablicu a nije u whitelist/ignore.

**Kako dodati novu balance migraciju u gate:**
1. Commit migraciju u `supabase/migrations/`.
2. Dodaj glob u `BALANCE_MIGRATIONS.txt` na kronološki ispravno mjesto.
3. Ako uvodi novi stupac koji trigger/recompute čita, uskladi `baseline.sql` (ili koristi `ADD COLUMN IF NOT EXISTS` u migraciji).

## Trenutna whitelist (7 migracija)

- `20260624083605` — anchor kolone + recompute + trigger
- `20260624131214` — restore + recompute becomes no-op unanchored
- `20260624132036` — trigger split (anchored=full recompute, unanchored=delta)
- `20260628163325` — event_at + time_confidence + expenses_event_at_sync trigger
- `20260628174219` — user_edited_event_at + resolve_event_at_merge
- `20260628205415` — hybrid vs day_cut engine mode
- `20260630202419` — backfill anchors za NULL anchor sources

## Napomene

- `00_setup.sql` + `10_scenarios.sql` MORAJU trčati u ISTOJ psql sesiji
  (setup otvara BEGIN + SAVEPOINT). CI ih pipe-a u jedan poziv.
- SKIP-ovi: A4 (čeka PR2 atomarni SET sidra), B6/B7 (vitest-only, nema SQL-specifične logike).
