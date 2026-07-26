
# Read-only dijagnoza — migracija `20260722223736` (Trial B RPC)

## Što sam mogao potvrditi statički (bez izvršavanja)

**Migracija ima točno 2 SQL naredbe (53 linije):**
1. `DROP TRIGGER IF EXISTS on_auth_user_created_trial ON auth.users;`
2. `CREATE OR REPLACE FUNCTION public.activate_module_trial(_module text) ...` + `REVOKE`/`GRANT` na toj funkciji.

**Preduvjeti u replay lancu do te točke:**
- `public.user_entitlements` je kreirana u `20260716170220_*` sa svim kolonama koje RPC referencira (`user_id, module, source, status, period_start, period_end, created_at`) i CHECK-om koji uključuje `'trial'` (nakon `20260717200125_*` refita).
- `auth.uid()` shim postoji (koristi ga i prethodni RPC lanac bez problema).
- `authenticated`/`anon` role postoje (`GRANT`/`REVOKE` na njima ne bi trebao pući).
- Isti pattern `DROP TRIGGER IF EXISTS on_auth_user_created_trial ON auth.users;` **već je izvršen bez pucanja** u ranijoj migraciji `20260717175314_*` (koja i kreira taj trigger). Ako bi to bio ownership problem na `auth.users`, replay bi puknuo tamo, ne ovdje. Znači ownership nad `auth.users` u CI replay okruženju **radi**.

**Zaključak statičke analize:** ništa u samoj migraciji ne izgleda očito neispravno u odnosu na stanje baze u tom trenutku. Poruka "At statement: 0" iz Supabase CLI-ja je gotovo sigurno lažni trag — CLI ne prosljeđuje stvarni SQLSTATE.

## Zašto ne mogu izvršiti izolirani replay iz ovog sandboxa

- **Nema Docker**, **nema Supabase CLI**, **nema lokalnog Postgresa** u Lovable sandboxu (isti razlog zbog kojeg `stress/bin/run-all.sh --smoke` traži lokalni stroj — vidi `stress/README.md`).
- `PGHOST` u ovom okruženju pokazuje na **produkcijsku bazu**, gdje je ova migracija **već uspješno primijenjena**. Bilo kakav pokušaj "replay-a" tamo nije izoliran, potencijalno je destruktivan i ne bi dao dijagnostički signal za CI grešku.
- Puna PG poruka iz CI loga koji je Milan tražio ranije bila je odsječena (`[... 1449 chars truncated ...]` nakon `effect/sql/SqlError: Failed`) — pravi SQLSTATE i tekst nisu dostupni u zapisu koji sam vidio.

## Predlažem dva READ-ONLY puta da se dođe do stvarne poruke

Milan odlučuje. Nijedno od ovoga ne mijenja repo, ne pipa produkciju, ne dispatcha ništa dok Milan ne kaže.

### Put A — dohvatiti pun CI log tog koraka (najbrže, nula rizika)

- Otvoriti isti job (`stress-smoke` run 30209544229, job 89813355005) i uzeti puni log koraka `Start Supabase with cron extension bootstrap` bez trunciranja (u prethodnom pokušaju ga je harness odsjekao na 1449 znakova).
- U tom logu tražiti prvi `ERROR:` iznad `effect/sql/SqlError: Failed` — Supabase CLI to obično ispisuje s pravim SQLSTATE-om (`42501`, `42P01`, `42704`, `22P02`...) i imenom objekta.
- Ako je zapis stvarno tako oskudan da nema `ERROR:` linije iznad, prijeći na Put B.

### Put B — lokalna izolirana repro (Milan pokreće na svom stroju)

Točan minimalni skup koraka koji Milan može izvršiti lokalno; ja ga ne mogu izvesti u sandboxu:

```bash
# 1) Podigni čistu lokalnu Supabase bazu (bez migration replay-a) —
#    isti mehanizam kao u stress harnessu, ali zaustavi PRIJE PHASE 5.
cd stress
cp env.example .env  # ako već ne postoji
# ručno: supabase start; zatim primijeni bootstrap-cron-extensions.sql i
# bootstrap-cron-helpers.sql (kao PHASE 3 u bootstrap-local-db.sh).

# 2) Primijeni sve migracije DO (ali bez) 20260722223736 redom kroz psql,
#    da baza bude u točno onom stanju u kojem CI puca:
DB_URL="$(supabase status --output env | awk -F= '/^DB_URL=/{print $2}')"
cd ..
for f in $(ls supabase/migrations/*.sql | sort | awk '$0 < "supabase/migrations/20260722223736"'); do
  echo ">>> $f"
  PGOPTIONS='-c client_min_messages=notice' \
    psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f "$f" || { echo "STOP at $f"; break; }
done

# 3) Sada primijeni SAMO problematičnu migraciju — ovo je jedini korak
#    koji nam treba za pravu PG poruku:
PGOPTIONS='-c client_min_messages=notice' \
  psql "$DB_URL" -v ON_ERROR_STOP=1 -X -e \
  -f supabase/migrations/20260722223736_1e2d258c-f7b2-4739-b25b-c87988266767.sql
```

Očekivani output koji nam treba nazad:
- točna naredba na kojoj puca (`DROP TRIGGER ...` ili `CREATE OR REPLACE FUNCTION ...`),
- **SQLSTATE** kod (5-znakovni, npr. `42501`),
- puna PG `ERROR:` linija + eventualni `DETAIL:` / `HINT:`.

`psql -e -v ON_ERROR_STOP=1` će prikazati točnu naredbu prije nego padne; `PGOPTIONS='-c client_min_messages=notice'` osigurava da se ne progutaju NOTICE-i koji ponekad razotkriju owner/permission uzrok.

## Hipoteze koje čekaju stvarnu poruku

Bez prave poruke ovo su **nedokazane** hipoteze, poredane po tome što bi CLI mogao zaista sakriti iza "At statement: 0":

1. **Drift redoslijeda replay-a u CI-ju** — možda se u CI replay lancu neka ranija migracija (između `20260717200125` i `20260722223736`) primijenila drugačije nego u produkciji i ostavila `user_entitlements` bez `source` = `'trial'` u CHECK constraintu, ili je promijenjena signatura `has_entitlement`/enum. Ovo je **problem CI baseline-a**, ne živog Trial B.
2. **Ownership/privilegija za `REVOKE ... FROM PUBLIC, anon`** na funkciji koja u lokalnom Supabaseu ima drugog vlasnika nego u produkciji. Malo vjerojatno jer replay dolazi kao `postgres`, ali moguće ako je funkcija netko drugi kreirao prije (ne bi trebalo — `CREATE OR REPLACE` je prva pojava).
3. **`auth.uid()` shim nedostaje ili ima drugi return type** u trenutku replay-a u CI (funkcija se kompilira ali `SET search_path = public` bi mogao nešto pomrsiti u CI slici koja se razlikuje od žive baze).

**Ništa od navedenog ne implicira problem na produkciji** — tamo Trial B RPC već postoji i radi (Milan je potvrdio da aktivacija triala prolazi). Ovo je gotovo sigurno **CI bootstrap redoslijed/drift problem**, ne funkcionalni bug.

## Što NE radim

- Ne mijenjam migraciju, `bootstrap-local-db.sh`, `BALANCE_MIGRATIONS.txt`, ni `stress-smoke.yml`.
- Ne dispatcham workflow.
- Ne izvršavam ništa protiv produkcijske baze na `PGHOST`.
- Ne pišem CI shim ni "quick fix" — čekam pravu PG poruku prije bilo kakve rasprave o smjeru.

## Milan odlučuje

- Put A (pun CI log) ili Put B (lokalna repro)?
- Ako Put B — Milan izvršava korake iznad na svom stroju i vraća mi točnu SQLSTATE + ERROR liniju; ja onda radim novu read-only analizu na temelju stvarne poruke.
