
## Popravak bootstrap-replay drifta u migraciji `20260609034641`

Milan je odobrio SAMO ovaj popravak + skeniranje. Plan je prijedlog — čekam potvrdu prije izvršenja.

### 1) Točna izmjena — `supabase/migrations/20260609034641_7dc2d645-6bde-4370-97fb-adfbe67d776b.sql`

Zamjena `::regprocedure` cast literalne funkcije s `to_regprocedure(...)` koji vraća `NULL` kad funkcija ne postoji (umjesto SQLSTATE 42883).

**Prije (redovi 5–16):**
```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'public.projects'::regclass
       AND NOT tgisinternal
       AND tgfoid = 'public.add_project_owner_as_member()'::regprocedure
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.projects', r.tgname);
  END LOOP;
END $$;
```

**Poslije:**
```sql
DO $$
DECLARE
  r record;
  fn_oid oid := to_regprocedure('public.add_project_owner_as_member()');
BEGIN
  IF fn_oid IS NULL THEN
    -- Funkcija ne postoji (from-scratch CI replay); nema triggera za drop.
    RETURN;
  END IF;
  FOR r IN
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'public.projects'::regclass
       AND NOT tgisinternal
       AND tgfoid = fn_oid
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.projects', r.tgname);
  END LOOP;
END $$;
```

Ostatak fajla (185 preostalih redova) ostaje bit-identičan.

**Semantika na produkciji je identična:** funkcija je tamo postojala u lipnju, `to_regprocedure` vraća isti OID koji bi vratio i `::regprocedure` cast. Petlja pronalazi iste triggere i drop-a ih. Razlika nastaje samo u from-scratch replay-u gdje funkcije nikad nema — tada se blok elegantno preskoči.

Napomena: `'public.projects'::regclass` u redu 10 ostaje netaknut — tablica `projects` postoji od prve migracije, cast je siguran.

### 2) Editirati postojeću migraciju ili forward-fix?

**Preporuka: editirati postojeću.**

Razlozi:
- Supabase CLI usklađuje migracije po **version stringu** (timestamp iz imena) upisanom u `supabase_migrations.schema_migrations`. Sadržaj SQL-a već primijenjenih migracija se **ne re-izvršava** na produkciji — CLI samo provjeri da version postoji u tablici. Editiranje sadržaja ne mijenja produkcijsku bazu.
- Forward-fix migracija **ne rješava CI problem**. CI radi from-scratch replay: pada u redu #316 lanca (20260609034641). Nova migracija #700 se nikad ne bi izvršila jer se replay zaustavi ranije.
- Ovo je standardni pattern za "replay drift" popravke — mijenjaš staru migraciju da bude idempotentna/replay-safe.

**Sigurnosni check:** Nema `DROP`/`ALTER` semantičke promjene — samo guard oko postojeće petlje. Nema šanse za regresiju na produkciji jer se sadržaj ne re-izvršava.

**Rizik = nula za produkciju, popravlja CI.**

### 3) KORAK 2 — skeniranje cijelog lanca za slične nezaštićene reg* castove

Skenirao sam `supabase/migrations/**` s regexom `::reg(procedure|class|type|proc|namespace|role|oper)` isključujući `to_reg*` pozive.

**Rezultat — 4 pogodka ukupno, samo 1 rizičan:**

| # | Fajl | Red | Cast | Objekt | Rizik replay-a |
|---|---|---|---|---|---|
| 1 | `20260131051957_cb843269-...sql` | 21 | `::regclass` | `public.project_funding` | **Nema** — tablica kreirana ranije u lancu (`20260125...`), postoji u trenutku ovog casta |
| 2 | `20260725053149_d91c5f01-...sql` | 30 | `::regtype` | `trigger` | **Nema** — `trigger` je ugrađeni PG tip, uvijek postoji |
| 3 | `20260609034641_...sql` | 10 | `::regclass` | `public.projects` | **Nema** — tablica postoji od prve migracije |
| 4 | `20260609034641_...sql` | 12 | `::regprocedure` | `public.add_project_owner_as_member()` | **DA — jedini krivac**, popravlja se u Koraku 1 |

Zaključak: nakon popravka Koraka 1, u migracijskom lancu **nema više nezaštićenih reg* castova** koji mogu puknuti u from-scratch replay-u. Neće biti sljedeće rupe za istu klasu problema.

Napomena: skeniranje pokriva samo `::reg*` sintaksu. Postoje i druge klase replay driftova (npr. `CREATE OR REPLACE FUNCTION` koji ovisi o kasnije-dodanoj koloni, hard `DROP` bez `IF EXISTS`, referenca na enum vrijednost koja još ne postoji). Ovo skeniranje ih NE pokriva — to je poseban paket ako Milan želi.

### 4) Što nije dirnuto

- Druge migracije — nula izmjena.
- `supabase/migrations` datoteke iz nalaza #1, #2, #3 iz tablice — nisu rizične, ne diram ih.
- Bootstrap skripta (`.github/workflows/*`, seed skripte, `stress/` harness) — netaknuto.
- Nema stress dispatch-a.
- Nema dodatnog skeniranja izvan `::reg*` castova.

### Očekivani ishod

Sljedeći stress-smoke run će proći PHASE 5 replay preko migracije `20260609034641` i nastaviti dalje. Ako pukne kasnije, to je NOVI drift kojeg trenutno skeniranje ne obuhvaća — javljam Milanu za odluku bez samostalnog popravka.
