
## Uzrok pada (reproducirano lokalno)

Balance SQL suite pada na P24 scenariju s greškom:

```
ERROR:  column "project_type" of relation "projects" does not exist
LINE 1: INSERT INTO public.projects (id, user_id, name, project_type...
CONTEXT: PL/pgSQL function inline_code_block line 74 at SQL statement
```

P24 (a) i (b) prolaze; P24 (c) — batch varijanta koja stvara drugi projekt — pada odmah na INSERT-u jer curated `baseline.sql` za `public.projects` ima samo `id, user_id, name, contract_value, total_budget, created_at, updated_at`. Kolone `project_type`, `status`, `start_date` postoje u pravoj produkcijskoj shemi, ali ne u curated baseline (namjerno minimalnom — vidi mem://features/balance-regression-testing-policy).

Isti razlog postoji za `INSERT INTO public.project_workers (..., hourly_rate, daily_rate, currency, workday_hours)` — treba provjeriti odgovaraju li kolone baseline shemi.

## Fix

Uskladiti P24 (c) INSERT-e s curated baseline shemom u `supabase/tests/balance/10_scenarios.sql`:

1. `INSERT INTO public.projects` → koristiti samo `(id, user_id, name)` (identično kao P15 na liniji 901).
2. `INSERT INTO public.project_workers` → uskladiti s baseline definicijom (koristiti samo kolone koje P15 koristi ili one koje su definirane u baseline).

Nakon toga lokalno pokrenuti sve migracije + suite, potvrditi da P24 a/b/c/d svi PASS.

## Opseg (strogi)

- **Mijenja se:** samo `supabase/tests/balance/10_scenarios.sql` (P24 blok, cca linije 1607-1611).
- **Ne mijenja se:** baseline.sql, migracija `20260708181325_*.sql`, edge funkcije, klijentski kod, i18n katalozi.
- Semantika testa ostaje ista: 2 projekta, 2 payouta, batch enqueue → 1 agregirana obavijest s batch i18n ključem, count=2, project_names.

## Gate

- Lokalno: `psql` reprodukcija cijelog balance suita (bootstrap + baseline + whitelist migracija + 00_setup + 10_scenarios) — sve `PASS`, 0 `ERROR`/`FAIL`.
- CI: `Balance SQL Regression Suite` zelen.
- `tsgo` + `vitest` (nema promjena — samo SQL scenarij).

## Izvještaj a-e nakon merga

a) mijenjano; b) gate; c) rizik (nema — samo test-scenarij usklađen s baseline shemom); d) sljedeći korak (WS3a-2 nakon zelenog); e) svjesno preskočeno.
