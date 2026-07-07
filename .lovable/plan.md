# Plan: Redizajn `balance-sql-suite.yml` — kurirani baseline

## Preporuka: opcija (a) — kurirani balance baseline + selektivne migracije

Ostale opcije odbačene niže s obrazloženjem. Bez izmjena u ovom passu — samo dizajn na pregled.

---

## Zašto (a)

Deploy gate mora testirati **balance semantiku** (anchor/recompute/trigger), ne cijelu povijest sheme. Trenutni pristup "apply all 246 migrations" pao je iz dva neovisna razloga koje si dokazao:
1. Nedostajući Supabase stubovi (`storage.foldername`, `supabase_realtime` publikacija, vjerojatno još) — rješivo, ali beskrajno guranje repa.
2. **Fundamentalno:** povijest nije linearno replayabilna (konflikt na #30 `projects`, kaskada od 10+ padova). Ovo nije bug u bootstrapu — to je stanje repozitorija.

Vanjski harness s minimalnom shemom + stvarnim balance funkcijama već prolazi 23+ assertiona → dokaz da izolirani pristup radi tehnički i semantički.

## Trade-offovi (iskreno)

**Za (a):**
- Deterministički, brz (< 10s vs. trenutnih 45s+ padova), izolira stvarnu regresiju.
- Testira **točno** ono što policy štiti: balance trigger + recompute + writer intent.
- Baseline je mali (3 tablice, ~15-20 stupaca) → lako se održava.

**Protiv (a):**
- Baseline se mora ručno održavati kad se doda stupac na `expenses`/`custom_payment_sources`/`app_settings`. Mitigacija: drift-check step (v. dolje).
- Ne testira interakcije s drugim tablicama (npr. `budget_plans`, `krug_*`). Prihvatljivo — te interakcije nisu balance-invariant; imaju vlastite testove (vitest, e2e).

## Odbačene opcije

- **(b) `pg_dump --schema-only`**: veže CI na produkcijski snapshot (secret pipeline, rotacija), uvodi noise iz nebalance tablica, i dalje ne rješava konflikte kad se doda nova migracija koja pretpostavlja starije stanje. Ne rješava fundamentalni problem, samo ga premješta.
- **(c) popraviti replayabilnost 246 migracija**: konflikt #30 znači da je barem jedna migracija editirana post-hoc. Popravak zahtijeva forenziku svih 246 + rekonstrukciju redoslijeda + testiranje svakog međukoraka. Procjena: dani rada, visok rizik regresije u drugim područjima, nula dobitka za balance gate. Odbačeno.
- **(d) Supabase CLI + `db reset`**: prividno "službeni" put, ali koristi točno isti migracijski skup koji je već dokazano ne-replayabilan. Ne pomaže.

---

## Dizajn (opcija a)

### 1. Novi fajl: `supabase/tests/balance/baseline.sql`

Kurirana minimalna shema, **samo balance-relevantne tablice** s **samo stupcima koje balance funkcije/trigger čitaju ili pišu**:

- `public.custom_payment_sources` — id, user_id, name, balance, currency, `correction_anchor_date`, `correction_anchor_balance`, `anchor_recompute_epoch`, created_at, updated_at (+ minimalni tipovi/defaulti).
- `public.expenses` — id, user_id, amount, `payment_source`, `payment_source_id`, `type` (expense/income/transfer), `expense_nature`, `transfer_to_source`, `event_at`, `time_confidence`, `user_edited_event_at`, `date`, `deleted_at`, created_at, updated_at.
- `public.app_settings` — key, value, updated_at (za `anchor_engine_mode`).
- `auth.users` FK stub (već u `bootstrap.sql`).

**Ne uključuje:** RLS, GRANTs, indekse osim onih koje trigger/recompute koristi (npr. na `payment_source_id`, `event_at`). Bez ostalih 90+ tablica.

### 2. Novi fajl: `supabase/tests/balance/BALANCE_MIGRATIONS.txt`

Whitelist balance-relevantnih migracija u redoslijedu (točan popis potvrdim kad krene build, ali nacrt):
```
20260624083605_*.sql   # anchor kolone + baseline recompute + trigger
20260624131214_*.sql   # (potvrditi je li balance-relevantna)
20260624132036_*.sql   # trigger split anchored/unanchored
20260628163325_*.sql   # expenses_event_at_sync trigger
20260628174219_*.sql   # (potvrditi)
20260628202419_*.sql   # (potvrditi)
20260628205415_*.sql   # hybrid vs day_cut + preview funkcija
# + buduće PR2 migracije (set_source_anchor RPC, _prevent_direct_anchor_update)
```
Fajl je jedini "source of truth" za suite — dodavanje/uklanjanje se radi ovdje.

### 3. Izmjena `.github/workflows/balance-sql-suite.yml`

Zamijeniti "Apply migrations in order" korak s:
```yaml
- name: Apply curated balance baseline
  run: psql -v ON_ERROR_STOP=1 -f supabase/tests/balance/baseline.sql

- name: Apply balance-relevant migrations in order
  run: |
    set -euo pipefail
    while IFS= read -r pattern; do
      [[ -z "$pattern" || "$pattern" =~ ^# ]] && continue
      for f in supabase/migrations/${pattern}; do
        echo "==> Applying $f"
        psql -v ON_ERROR_STOP=1 -f "$f"
      done
    done < supabase/tests/balance/BALANCE_MIGRATIONS.txt
```

`bootstrap.sql` ostaje (auth/storage/role stubovi, `auth.users` seed).

### 4. Drift-check (zaštita od baseline zastarjelosti)

Novi korak u istom jobu, **prije** primjene baselinea:
```yaml
- name: Detect balance-relevant migration drift
  run: |
    # Fail ako je novi fajl u supabase/migrations/ dirao expenses/custom_payment_sources/app_settings
    # a nije u BALANCE_MIGRATIONS.txt niti eksplicitno na ignore listi.
    bash supabase/tests/balance/detect-drift.sh
```
Skripta: `git diff origin/main...HEAD -- supabase/migrations/` filtrirano na fajlove koji sadrže `expenses|custom_payment_sources|app_settings|anchor` → svaki takav fajl mora biti ili u `BALANCE_MIGRATIONS.txt` ili u `BALANCE_MIGRATIONS_IGNORE.txt` (s razlogom). Inače fail s uputom autoru PR-a.

Ovo mehanički prisiljava da svaka izmjena balance sheme aktivno odluči: "ide u gate" ili "eksplicitno izuzeto (zašto)".

### 5. README dopuna (`supabase/tests/balance/README.md`)

Nova sekcija "CI arhitektura" objašnjava: kurirani baseline, whitelist, drift-check, kako dodati novu balance migraciju (2 koraka: commit migracije + upiši pattern u `BALANCE_MIGRATIONS.txt`).

---

## Rizici i mitigacije

| Rizik | Mitigacija |
|---|---|
| Baseline drift (dodan stupac koji trigger čita, zaboravljen u baseline) | Drift-check step + fail-loud SQL greška u suiteu |
| Balance migracija ovisi o nebalance tablici (npr. FK) | Dodati minimalni stub te tablice u `baseline.sql` s komentarom |
| Netko doda migraciju u whitelist koja ovisi o preskočenoj | CI fail na apply → autor mora ili proširiti baseline ili razdvojiti migraciju |
| Produkcijska shema divergira od baselinea | Kvartalni ručni audit (dodati u projektnu memoriju) |

## Ne-ciljevi (eksplicitno)

- Ne testira RLS, GRANT-ove, druge tablice, edge funkcije, cron jobove.
- Ne zamjenjuje vitest suite (koja pokriva 17 scenarija na mirror logici).
- Ne popravlja povijesnu ne-replayabilnost migracija (zaseban problem, izvan ovog scopea).

## Redoslijed rada (nakon odobrenja)

1. Napisati `baseline.sql` (introspekcija stvarnih migracija za točan popis stupaca).
2. Napisati `BALANCE_MIGRATIONS.txt` + `detect-drift.sh`.
3. Izmijeniti workflow.
4. Push → CI zelen → potvrda.
5. README dopuna.
6. Zapis u projektnu memoriju (`mem://features/balance-regression-testing-policy`) — dopuna sekcije "CI arhitektura".

## Otvorena pitanja prije koda

1. **Točan whitelist:** Da introspektiram svih 246 migracija i predložim finalni popis balance-relevantnih (grep na `expenses|custom_payment_sources|app_settings|anchor|recompute`) prije početka implementacije, ili biraš popis ručno?
2. **Drift-check strogost:** fail na svaku izmjenu tih tablica (strogo), ili samo warning uz manualni override label na PR-u?
3. **Baseline lokacija:** `supabase/tests/balance/baseline.sql` (predloženo) ili `supabase/tests/balance/schema/000_baseline.sql` s prostorom za buduće particije?
