## Nalaz (read-only, bez izmjena)

**Klasifikacija:** (b) bootstrap pao na NOVOJ migraciji. Auth.users guardovi rade.

### 1. Auth.users guardovi — potvrđeno RADE
Bootstrap je prošao migraciju `20260722223736` (i ostale s auth.users DDL) bez greške. Napredovao je ~200 migracija dalje od prethodne točke pada.

### 2. Stress scenariji nisu krenuli
PHASE 5 pao prije scenarija. `stress/reports/` upload prazan (warn).

### 3. Nova točka pada
- **Migracija:** `20260725044309_17ffcff3-9b9d-47cf-83bf-a6d7b9e8689d.sql`
- **Statement 17:** `REVOKE EXECUTE ON FUNCTION public.is_budget_member(uuid, uuid) FROM anon`
- **Diag A (pravi SQLSTATE):** `42883: function public.is_budget_member(uuid, uuid) does not exist`
- **LOCATION:** `LookupFuncWithArgs, parse_func.c:2444`

Prethodnih 16 REVOKE naredbi u istoj migraciji prošlo je (consume_invitation_token, cleanup_*, has_role, has_any_paid_plan, has_active_module_grant, has_full_payment_source_access, is_budget_owner). `is_budget_member(uuid, uuid)` je prva funkcija koja u lokalno replayanom lancu ne postoji s tim potpisom.

### 4. Nije infra pad
CLI, `supabase start`, PHASE 1–4 svi OK. Pad u ~4s nakon starta PHASE 5.

### Značajno
Ovo je ista klasa problema kao anon-REVOKE plan (Faze 1/2/3): migracija tvrdi postojanje funkcije koja u lokalnom migracijskom lancu ne postoji s tim potpisom. Guard-shim `secdef_anon_shim.sql` ovdje NE pomaže jer se ne pokreće u bootstrap replayu — samo prije CI invariant testa.

### Sljedeći koraci (prijedlog, čekam Milanovu odluku)
- **Opcija A:** Guard po šablonu iz `20260609034641` — omotati REVOKE u `to_regproc(...) IS NOT NULL` provjeru (safe: revoke se preskoči ako funkcije nema).
- **Opcija B:** Whitelistati migraciju u stress bootstrapu.
- **Opcija C:** Istražiti zašto `is_budget_member(uuid, uuid)` nedostaje u lokalnom lancu (možda je definirana s drukčijim potpisom u nekoj ranijoj migraciji, ili je uvedena samo direktno u produkciju).

Nikakva izmjena nije napravljena. Stress workflow nije dispatchan.
