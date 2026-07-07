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
primjenjuje `bootstrap.sql` (auth/storage stubovi + role), zatim `baseline.sql`
(kurirana minimalna shema balance tablica), pa **samo** balance-relevantne
migracije iz `BALANCE_MIGRATIONS.txt`, i pokreće suite. Trigger: PR-ovi koji
diraju `supabase/migrations/**`, `supabase/tests/**` ili `src/lib/balance/**`.

## CI arhitektura (curated baseline)

Puna povijest migracija **nije** linearno replayabilna na čistom
`postgres:16` — nedostaju Supabase interni artefakti (`storage.foldername`,
`supabase_realtime` publikacija, itd.) i postoje međusobno konfliktne
migracije u povijesti (npr. `projects` se ponovno stvara u kasnijoj
migraciji bez `IF NOT EXISTS`). Puni replay padne unutar prvih 30 migracija.

Zato gate ne pokušava replayati povijest. Umjesto toga:

1. `bootstrap.sql` — Supabase-kompatibilni stubovi (auth/storage/realtime
   sheme, role, `auth.users` seed).
2. `baseline.sql` — **kurirana** minimalna shema: samo `expenses`,
   `custom_payment_sources`, `app_settings` s pre-anchor / pre-event_at
   stupcima. Bez RLS, bez GRANT-ova, bez ostalih 90+ tablica.
3. `BALANCE_MIGRATIONS.txt` — whitelist balance-relevantnih migracija
   (trenutno 7) koje se primjenjuju točno u tom redoslijedu na baseline.
   Sve balance kolone koje dodaju (`correction_anchor_*`, `event_at`,
   `time_confidence`, `user_edited_event_at`) koriste `IF NOT EXISTS`
   i sigurno se slažu s baselineom.
4. `detect-drift.sh` — strogi gate koji hvata svaki PR-diff nad
   `supabase/migrations/` koji dira balance-relevantne tablice/funkcije
   a nije u whitelistu. Override postoji preko
   `BALANCE_MIGRATIONS_IGNORE.txt` (svaka iznimka mora imati obrazloženje).

### Kako dodati novu balance migraciju u gate

1. Commit-aj migraciju u `supabase/migrations/`.
2. Dodaj glob (npr. `20260701123456_*.sql`) u `BALANCE_MIGRATIONS.txt` na
   kronološki ispravno mjesto.
3. Ako migracija dodaje novi stupac koji balance funkcije čitaju/pišu,
   uskladi i `baseline.sql` (ili se osloni na `ADD COLUMN IF NOT EXISTS`
   u samoj migraciji — preferirano).
4. Push → CI će se pokrenuti automatski.

### Kako izuzeti balance-adjacent migraciju (RLS-only itd.)

Dodaj glob u `BALANCE_MIGRATIONS_IGNORE.txt` s komentarom koji obrazlaže
zašto je promjena balance-neutralna.

## Pokretanje (lokalno, identično CI-ju)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/balance/bootstrap.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/balance/baseline.sql
sed -E 's/[[:space:]]*#.*$//' supabase/tests/balance/BALANCE_MIGRATIONS.txt \
  | awk 'NF' \
  | while read pat; do
      for f in supabase/migrations/$pat; do
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
      done
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
