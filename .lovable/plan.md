# Root cause (potvrđen)

`CreateKrugDialog` insert prolazi `WITH CHECK`, ali PostgREST radi `RETURNING id` (`.select('id')`) koji ide kroz `krug_select_member` policy `USING (krug_is_member(id, auth.uid()))`. Bootstrap trigger NE POSTOJI (potvrđeno `pg_trigger`-om, 0 user triggera na `public.krug`), pa `krug_membership` ostane prazan → SELECT visibility ne prolazi → PostgREST vraća `new row violates row-level security policy for table "krug"`.

Klijent + enumi + `krug_enforce_punopravni_cap` su čisti. Nema legacy `owner/full/limited` ni `paused/terminated` referenci u Krug schemi.

# Spoofing surface — što već postoji

Postojeća policy `krug_insert_authenticated`:
```
WITH CHECK ((auth.uid() IS NOT NULL) AND (created_by = auth.uid()))
```
Već blokira spoof preko `authenticated` role. RLS check je dovoljan za normalni klijent path. **Ali**: SECURITY DEFINER pozivi i service_role bypass-aju RLS, pa pravilo nije zakon na DB razini — samo na PostgREST razini.

# Fix (belt-and-suspenders)

Jedna migracija dodaje 2 stvari:

### A) Bootstrap trigger (rješava RLS RETURNING)

`SECURITY DEFINER` AFTER INSERT trigger upisuje ownership + 'punopravni' membership za `NEW.created_by`. Idempotentno (`ON CONFLICT DO NOTHING`). Cap trigger propušta prvi punopravni (0 < 2).

### B) `created_by` integrity (zatvara spoofing rupu)

BEFORE INSERT trigger na `public.krug`, NIJE `SECURITY DEFINER` (želimo da vidi pozivateljev `auth.uid()`):

```sql
CREATE OR REPLACE FUNCTION public.krug_enforce_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  -- Service role / pozadinski poslovi: auth.uid() je NULL.
  -- Eksplicitno zahtijevamo postavljen created_by u tom slučaju.
  IF v_uid IS NULL THEN
    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'krug.created_by must be set';
    END IF;
    RETURN NEW;
  END IF;

  -- Authenticated path: created_by je UVIJEK pozivatelj.
  -- Bez obzira šalje li klijent NULL, svoj UUID, ili tuđi.
  NEW.created_by := v_uid;
  RETURN NEW;
END;
$$;

CREATE TRIGGER krug_enforce_created_by_bef
BEFORE INSERT ON public.krug
FOR EACH ROW EXECUTE FUNCTION public.krug_enforce_created_by();
```

Posljedica:
- Klijent može slati bilo što (čak i tuđi UUID); DB prepiše s `auth.uid()` prije WITH CHECK. Spoofing je nemoguć neovisno o policy-ju.
- RLS `WITH CHECK (created_by = auth.uid())` ostaje (double-belt — ako trigger ikad bude drop-an, RLS i dalje hvata).
- Service role smije postaviti bilo koji `created_by` (admin/backfill path).

### Bootstrap trigger

```sql
CREATE OR REPLACE FUNCTION public.krug_bootstrap_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.krug_ownership (krug_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT (krug_id) DO NOTHING;

  INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'punopravni'::public.krug_membership_role, NEW.created_by)
  ON CONFLICT (krug_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER krug_bootstrap_creator_aft
AFTER INSERT ON public.krug
FOR EACH ROW EXECUTE FUNCTION public.krug_bootstrap_creator();
```

Order: BEFORE (enforce) → INSERT → AFTER (bootstrap). `krug_bootstrap_creator` koristi već prepisani `NEW.created_by`, pa ne može upisati ownership na tuđeg usera.

# Verification

1. UI: kreirati Krug → dialog se zatvori, redirect na detail.
2. `SELECT user_id FROM krug_ownership WHERE krug_id=<new>` = `auth.uid()` pozivatelja.
3. `SELECT user_id, role FROM krug_membership WHERE krug_id=<new>` = `(auth.uid(), 'punopravni')`.
4. Spoofing test: insert sa `created_by = '<tuđi-uuid>'` → red se kreira sa `created_by = auth.uid()` (BEFORE trigger prepisao), bootstrap ide na pozivatelja, ne na žrtvu.
5. Supabase linter pass.

# Out of scope

- Nema promjena enuma, presetova, cap logike, lifecycle stanja, klijenta, KrugLifecycleBadge.
