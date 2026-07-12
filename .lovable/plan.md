## Problem

Zadnji stress-smoke run (#10) pao je u migraciji `20260609034641_7dc2d645-6bde-4370-97fb-adfbe67d776b.sql` na statementu:

```sql
DROP FUNCTION IF EXISTS public.is_project_manager(uuid, uuid);
```

Uzrok: dvije RLS police na `public.expenses` (UPDATE i DELETE) još uvijek referenciraju `is_project_manager`. PostgreSQL ne dopušta drop funkcije dok postoje ovisni objekti (SQLSTATE 2BP01).

Postoji već forward-migracija `20260712200924_d0d23e6e-7b25-41d7-8d0a-2104751d2f50.sql` koja to rješava za produkciju, ali ona se izvršava *nakon* problematične migracije. Clean-replay (stress-smoke) pokreće migracije po redu, pa forward-migracija ne pomaže ako historijska već padne.

## Cilj

Osigurati da `stress-smoke` workflow prođe čisto na svježoj bazi, a da se istovremeno ne razjebe produkcija.

## Plan

### 1. Zakrpa historijske migracije

U `supabase/migrations/20260609034641_7dc2d645-6bde-4370-97fb-adfbe67d776b.sql`, prije `DROP FUNCTION IF EXISTS public.is_project_manager(uuid, uuid);`:

- Dropati dvije police na `public.expenses` koje koriste `is_project_manager`:
  - `Users can update their own expenses`
  - `Users can delete their own expenses`
- Rekreirati ih s istim uvjetima, ali s `public.is_project_owner(project_id, auth.uid())` umjesto `is_project_manager`.

Ovo čini migraciju samodovoljnom za clean replay.

### 2. Sačuvati forward-migraciju

`20260712200924_d0d23e6e-7b25-41d7-8d0a-2104751d2f50.sql` ostaje na mjestu da pokrije produkcijske baze gdje je historijska migracija već prije djelomično/uspješno prošla. Nije potrebno brisati je.

### 3. Lokalna verifikacija

Pokrenuti lokalno:

```bash
bash stress/bin/bootstrap-local-db.sh start
```

ili ekvivalentan `supabase start` s migracijama omogućenim, i potvrditi da:

- `supabase migration up` prođe do kraja bez `2BP01`
- `public.is_project_manager` više ne postoji
- `public.expenses` police koriste `is_project_owner`

### 4. Pokretanje stress-smoke workflowa

Nakon pusha zakrpe na `main`, pokrenuti GitHub Actions workflow `stress-smoke` i potvrditi da run #11 (ili sljedeći) završi s `success`.

### 5. Rezultat

- `stress-smoke` workflow ponovno zeleni.
- Clean replay migracija radi bez intervencije.
- Produkcija ostaje stabilna zbog idempotentne forward-migracije.

## Napomena

Ne dirati `src/integrations/supabase/client.ts`, `types.ts` ni `.env`. Ovo je čista SQL migracijska zakrpa.