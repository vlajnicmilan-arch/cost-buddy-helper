---
name: SECURITY DEFINER anon revoke
description: Svaka nova SECURITY DEFINER funkcija u schema public MORA imati eksplicitni REVOKE EXECUTE ... FROM anon uz REVOKE FROM PUBLIC + GRANT authenticated/service_role
type: constraint
---
Supabase `ALTER DEFAULT PRIVILEGES` automatski dodjeljuje `EXECUTE` na nove funkcije u `public` shemi roli `anon`. `REVOKE ... FROM PUBLIC` **ne pokriva** taj direktni grant.

**Pravilo:** za svaku novu `SECURITY DEFINER` funkciju u `public`, migracija mora sadržavati:

```sql
REVOKE ALL ON FUNCTION public.<fn>(<sig>) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<fn>(<sig>) FROM anon;
GRANT EXECUTE ON FUNCTION public.<fn>(<sig>) TO authenticated;
GRANT EXECUTE ON FUNCTION public.<fn>(<sig>) TO service_role;
```

Izostavi `anon` REVOKE samo ako je javno pozivanje eksplicitno namjeravano (i tada dodaj `GRANT ... TO anon`).

**Precedens:** PR2 Faza A `set_source_anchor` — original grant blok nije imao anon REVOKE; eksterni audit uhvatio i rješio kroz hardening migraciju `20260707070825_*`.

**Why:** Defense-in-depth. Iako većina SECURITY DEFINER funkcija odmah baca 42501 na `auth.uid() IS NULL`, oslanjati se na runtime provjeru umjesto na grant matricu je krhko.
