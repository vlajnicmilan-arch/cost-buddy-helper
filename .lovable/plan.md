
## Put A — nalaz iz neodsječenog CI loga

Ništa nije odobreno za izmjenu. Ovo je samo prijava nalaza; Milan odlučuje smjer.

### Ispravak prethodne dijagnoze

Krivac **NIJE** migracija `20260722223736` (Trial B RPC). Supabase CLI je samo prijavio zadnju migraciju koju je *listao* prije prekida i lažnu poruku `At statement: 0 / DROP TRIGGER ...`. Bootstrap skripta ima ugrađen "PHASE 5 diag A" korak koji nakon pada radi direktan `psql` replay s verbose greškama — i on je ispisao pravi PG error.

### Prava PostgreSQL poruka (log linije 3756–3766)

```
[bootstrap] PHASE 5 diag A — direct psql replay of
  supabase/migrations/20260609034641_7dc2d645-6bde-4370-97fb-adfbe67d776b.sql
  with verbose errors:
DROP TRIGGER
psql:supabase/migrations/20260609034641_...sql:16: ERROR:  42883:
  function "public.add_project_owner_as_member()" does not exist
LINE 4:        AND tgfoid = 'public.add_project_owner_as_member()'::...
                            ^
QUERY:  SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'public.projects'::regclass
       AND NOT tgisinternal
       AND tgfoid = 'public.add_project_owner_as_member()'::regprocedure
CONTEXT:  PL/pgSQL function inline_code_block line 4 at FOR over SELECT rows
LOCATION:  regprocedurein, regproc.c:275
```

### Tabelarni sažetak

| Polje | Vrijednost |
|---|---|
| SQLSTATE | **42883** (`undefined_function`) |
| Failing migration | `supabase/migrations/20260609034641_7dc2d645-6bde-4370-97fb-adfbe67d776b.sql` |
| Linija u fajlu | 16 (unutar `DO`/inline PL/pgSQL bloka, red 4 unutar `FOR ... SELECT`) |
| Objekt koji nedostaje | `public.add_project_owner_as_member()` |
| Naredba koja puca | Cast `'public.add_project_owner_as_member()'::regprocedure` u `SELECT ... FROM pg_trigger WHERE tgfoid = ...` |
| DETAIL / HINT | Nema (PG samo prijavi undefined_function na regprocedure cast) |

### Interpretacija (bez akcije)

Ovo je klasičan **bootstrap-replay drift**, ne živi produkcijski problem:

- Migracija `20260609034641` (9. lipnja) je u vrijeme pisanja pretpostavila da funkcija `public.add_project_owner_as_member()` postoji, pa ju je bez guardanja kastala u `regprocedure`.
- U živoj bazi je funkcija tada postojala, migracija je prošla, sve radi.
- U CI "from scratch" replay-u ta funkcija nikad nije kreirana (vjerojatno je uklonjena/preimenovana ranijom migracijom u redoslijedu, ili je bila kreirana izvan migracijskog lanca), pa `regprocedure` cast puca prije nego što `FOR` petlja uopće provjeri postoji li trigger.
- Trial B (`20260722223736`) uopće nije bio pokrenut — replay je pukao 6+ tjedana ranije u lancu; CLI je samo prikazao krivu "zadnju" migraciju.

### Što je ostalo isto (za tvoju svijest)

- Produkcija: nije zahvaćena, funkcija je već primijenjena povijesno.
- Stress harness (layer2 scenariji 01–06): nije se ni pokrenuo.
- Artifact `stress/reports/` nije napisan → otud i "No files were found" u upload koraku.

### Opcije koje Milan može razmotriti (ne provodim ništa)

1. **Popraviti tu jednu migraciju** — zaštititi `regprocedure` cast (`to_regprocedure(...)` ili `IF EXISTS` provjera u `pg_proc`) da replay preskoči ako funkcije nema.
2. **Popraviti redoslijed** — provjeriti koja je ranija migracija uklonila/preimenovala `add_project_owner_as_member` i dodati odgovarajući shim za replay.
3. **CI baseline snapshot** — umjesto full replay od migracije #1, koristiti dump žive schemje kao baseline (isti pristup kao `secdef_anon_shim.sql`).

Čekam odluku prije bilo kakve akcije.
