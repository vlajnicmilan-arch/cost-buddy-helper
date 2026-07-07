# Balance Regression SQL Suite

**Authoritative** regression harness for the balance engine. Runs against a
real Postgres with the migration-defined functions and trigger. **Obavezne
migracije koje moraju biti primijenjene prije harnessa:**

- `20260624083605` — anchor columns, baseline recompute + trigger
- `20260624132036` — trigger split: full recompute for anchored, incremental
  delta for unanchored
- `20260628163325` — `expenses_event_at_sync` trigger koji dopunjava
  `event_at` / `time_confidence` iz `date` kad su NULL. Harness `mk_expense`
  helper ubacuje redove s NULL-ovima i oslanja se na ovaj trigger —
  **bez njega suite pada s NOT NULL violation umjesto stvarnim rezultatom.**
- `20260628205415` — hybrid vs day_cut via `app_settings.anchor_engine_mode`
  + `recompute_custom_source_balance_preview`

## Deploy Gate (project rule)

Nijedan deploy koji dira balance logiku (trigger, recompute, writer intent,
anchor semantika, migracije nad `expenses` ili `custom_payment_sources`) NE
IDE bez zelene ove suite. Vitest zelen nije dovoljan — istina živi u PG
funkcijama. Vidi `mem://features/balance-regression-testing-policy`.

CI job: `.github/workflows/balance-sql-suite.yml` — podiže `postgres:16`,
primjenjuje `bootstrap.sql` (auth/storage stubovi + role) pa sve
`supabase/migrations/*.sql` po redu, i pokreće suite. Trigger: PR-ovi koji
diraju `supabase/migrations/**`, `supabase/tests/**` ili `src/lib/balance/**`.

## Pokretanje (lokalno)

```bash
# Čisti postgres:16 (bez Supabase image-a):
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/balance/bootstrap.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/balance/00_setup.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/balance/10_scenarios.sql
```

Očekivano: sve `RAISE NOTICE 'PASS ...'` linije, nijedan `FAIL`. Setup
otvara transakciju s savepoint-om po scenariju kako bi izolirao stanje.

## Pokrivenost (mapping na 17 scenarija)

| # | Scenarij | SQL | Vitest |
|---|---|---|---|
| A1 | C3 same-day (hybrid) — historic exclude + manual_entry TODO | da | da |
| A2 | C3 next day → included | da | da |
| A3 | C1 same-day, event_at > anchor | da | da |
| A4 | Direct backfill without recompute (BUG 2) | da (SKIP) | da (skip) |
| A5 | Correction excluded from post-anchor sum | da | da |
| A6 | Soft delete → restore | da | da |
| A7 | Transfer anchored→unanchored | da | da |
| A8 | UPDATE payment_source A→B (unanchored/unanchored) | da | da |
| A9 | Same as A1 in day_cut mode | da | da |
| B1 | event_at == anchor_ts → excluded (strict `>`) | da | da |
| B2 | Transfer unanchored→anchored | da | da |
| B3 | Transfer anchored→anchored | da | da |
| B4 | Rebaseline anchor | da | da |
| B5 | Recurring instance with event_at after anchor | da | da |
| B6 | Multi-currency (FX ne dira post-anchor) | — | vitest-only |
| B7 | Bulk 100 rows partition | — | vitest-only |
| B8 | Concurrent writes (advisory lock) | da | vitest fallback |

B6/B7 su vitest-only jer nemaju SQL-specifičnu logiku (FX je iznad DB,
particija je puko brojanje). B8 se u SQL suite radi kroz dva paralelna
psql klijenta — vidi komentar u `10_scenarios.sql`.
