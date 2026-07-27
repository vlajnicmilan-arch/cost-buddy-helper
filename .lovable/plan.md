
# Faza C1 — FX snapshot + auto-freeze cron (PRIJEDLOG, čeka "gradi C1")

Cilj: povijesni Krug settlement postaje deterministički i immutabilan po zaključenju mjeseca. `touches_balance = false` (ne dira `expenses`, salda, ledger, ni bilo koji balance engine put).

## Verificirano prije plana (žive činjenice iz baze)

- Member-check funkcija koja se koristi u `krug_settlement_preview` je `public.krug_is_full_member(uuid, uuid)` (potvrđeno iz `pg_get_functiondef`). Koristi se identično u RLS-u nove tablice.
- Živi potpis preview-a: `krug_settlement_preview(p_krug_id uuid, p_period_start date, p_period_end date, p_display_currency text DEFAULT NULL, p_fx_rates jsonb DEFAULT '{}')` — `STABLE SECURITY DEFINER`, `search_path=public`. Novi kod polazi od `pg_get_functiondef` na `regprocedure`, ne od migracijske memorije (constraint `replace-function-start-from-live-def`).
- Vault secret `krug_notify_internal_key` postoji (potvrđeno `SELECT name FROM vault.secrets`). Reuse je slobodan.
- `exchange-rates` edge fn vraća `{ rates: { EUR:1, USD:…, HRK:7.5345, BAM:1.95583, … }, date, cached }` (verificirano iz `supabase/functions/exchange-rates/index.ts`). Format je stabilan i pokriva sve valute koje preview zove.
- Postoji referentna service-role cron funkcija `audit_secdef_anon_regression` — koristi se kao uzorak (REVOKE FROM anon, PUBLIC; GRANT EXECUTE TO service_role; SECURITY DEFINER).

## C1.1 — Tablica `public.krug_settlement_fx_snapshot`

Kolone:
- `krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE`
- `period_start date NOT NULL`
- `period_end date NOT NULL`
- `display_currency text NOT NULL`
- `rates jsonb NOT NULL` — mapa base=EUR, isti oblik kao klijentski `p_fx_rates`
- `source text NOT NULL DEFAULT 'frankfurter.app'`
- `snapshot_date date NOT NULL` — datum ratesa iz `exchange-rates` odgovora (`data.date`)
- `frozen_at timestamptz NOT NULL DEFAULT now()`
- `frozen_by text NOT NULL CHECK (frozen_by IN ('cron','manual'))`
- `created_at timestamptz NOT NULL DEFAULT now()`
- PK: `(krug_id, period_start, period_end, display_currency)`

Poredak u migraciji (4 koraka, isti obrazac kao ostatak projekta):
1. `CREATE TABLE public.krug_settlement_fx_snapshot (...)`
2. `GRANT SELECT ON public.krug_settlement_fx_snapshot TO authenticated;`
   `GRANT ALL ON public.krug_settlement_fx_snapshot TO service_role;`
   (bez `anon` — sve čita samo član kruga)
3. `ALTER TABLE public.krug_settlement_fx_snapshot ENABLE ROW LEVEL SECURITY;`
4. Policies:
   - SELECT `TO authenticated USING (public.krug_is_full_member(krug_id, auth.uid()))`
   - INSERT/UPDATE/DELETE: **nema policyja** → samo `service_role` (bypass RLS) piše. Nema client write puta.

Bez triggera. Nema veze s balance engineom.

## C1.2 — `krug_settlement_preview` (minimalna, aditivna izmjena)

Postupak (obavezan):
1. `SELECT pg_get_functiondef('public.krug_settlement_preview(uuid,date,date,text,jsonb)'::regprocedure)` → `/tmp/live_preview.sql`.
2. Diff u tu ŽIVU verziju, ne rewrite iz memorije.

Točke izmjene (samo dvije):

a) Nakon što se izračuna `v_display_currency` (linije ~52–62), dodati:
```
DECLARE v_snapshot_rates jsonb; v_snapshot_source text; v_snapshot_date date; v_frozen boolean := false;
SELECT rates, source, snapshot_date
  INTO v_snapshot_rates, v_snapshot_source, v_snapshot_date
FROM public.krug_settlement_fx_snapshot
WHERE krug_id = p_krug_id
  AND period_start = p_period_start
  AND period_end   = p_period_end
  AND display_currency = v_display_currency;
IF v_snapshot_rates IS NOT NULL THEN
  v_frozen := true;
END IF;
```

b) Svugdje gdje trenutna funkcija čita rate iz `p_fx_rates` (za konverziju paid/owed → display currency), zamijeniti izvor:
```
COALESCE(v_snapshot_rates, p_fx_rates)
```
Netting logika, gate (`krug_is_full_member`), override read, weights, transferi — **ne diraju se**.

c) U izlazni `jsonb_build_object(...)` za `fx`:
```
'fx', jsonb_build_object(
   'rates_used',   COALESCE(v_snapshot_rates, v_rates_used),
   'snapshot_date', COALESCE(v_snapshot_date, current_date),
   'source',       COALESCE(v_snapshot_source, 'client'),
   'frozen',       v_frozen
)
```

Backward-compat: potpis, ime, `SECURITY DEFINER`, `search_path`, `STABLE` — sve ostaje. Klijent (`useKrugSettlement`) i dalje šalje `p_fx_rates` — kad snapshota nema, ponašanje je bit-identično današnjem.

Frontend u ovoj pod-fazi se **ne** dira; `fx.frozen` je čisto aditivan i UI ga može čitati kasnije (npr. u C3).

## C1.3 — Cron freeze funkcija (Opcija A: čista SQL, bez novog edge fn)

Naziv: `public.krug_cron_freeze_fx_snapshots()`
Potpis: `RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`
Vlasništvo: `postgres` (kao ostale cron fn).
Grantovi (obavezno u istoj migraciji, isti obrazac kao `audit_secdef_anon_regression`):
```
REVOKE ALL ON FUNCTION public.krug_cron_freeze_fx_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_cron_freeze_fx_snapshots() TO service_role;
```

Skica tijela:
```
-- 1) Odredi prethodni mjesec (UTC)
v_period_start := date_trunc('month', (now() AT TIME ZONE 'UTC') - interval '1 month')::date;
v_period_end   := (date_trunc('month', (now() AT TIME ZONE 'UTC')) - interval '1 day')::date;

-- 2) Dohvati ratese kroz postojeći edge fn (reuse krug_notify_internal_key)
SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'krug_notify_internal_key';
SELECT net.http_post(
  url     := 'https://<project>.functions.supabase.co/exchange-rates',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ' || v_key,
    'apikey', v_key
  ),
  body    := '{}'::jsonb,
  timeout_milliseconds := 10000
) INTO v_req_id;
-- pollaj net._http_response dok status != NULL, parsiraj body → v_rates, v_snapshot_date
```
Za svaki `(krug_id, display_currency)` par (iterira aktivne krugove; `display_currency` = ista logika kao u `krug_settlement_preview` — `COALESCE(krug.settlement_currency, prvi shared source currency, 'EUR')`):
```
INSERT INTO public.krug_settlement_fx_snapshot
  (krug_id, period_start, period_end, display_currency, rates, source, snapshot_date, frozen_by)
VALUES (..., v_rates, 'frankfurter.app', v_snapshot_date, 'cron')
ON CONFLICT (krug_id, period_start, period_end, display_currency) DO NOTHING;
```
Vraća sažetak `{frozen: N, skipped: M, period_start, period_end}`.

Napomena o URL-u: koristi projektni functions domain (isti obrazac kao postojeći cron pozivi na `net.http_post` u projektu, npr. `notify-krug-event`). URL se hardkodira u tijelu funkcije (kao u drugim cron fn-ovima) — nije secret.

## C1.4 — pg_cron schedule (odvojeni `supabase--insert` poziv, ne migracija)

Zaključavanje policy-a: schedule sadrži env-specifične vrijednosti pa ide kroz `supabase--insert`, ne migraciju (isto kao postojeći cronovi):
```
SELECT cron.schedule(
  'krug_cron_freeze_fx_snapshots_monthly',
  '0 3 1 * *',                          -- 1. u mjesecu, 03:00 UTC
  $$ SELECT public.krug_cron_freeze_fx_snapshots(); $$
);
```
Idempotent: prije `cron.schedule` napravi `cron.unschedule` ako job već postoji (isti obrazac kao ostali projektni cronovi).

## Sigurnosne / arhitektonske potvrde (kritične)

- **touches_balance = false**: nova tablica + čitanje snapshota u preview-u; nema pisanja u `expenses`, `custom_payment_sources`, ni bilo koji anchor/ledger. Balance regression suite (`supabase/tests/balance/`) nije relevantan gate.
- **Cron fn service-role only**: eksplicitni `REVOKE FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`. Isti obrazac kao `audit_secdef_anon_regression`.
- **Preview aditivna**: kad snapshota nema, izlaz je bit-identičan današnjem (samo dobiva `fx.frozen: false`). Klijent i vitest suite ne trebaju izmjene za C1.
- **Reuse secreta**: `krug_notify_internal_key` postoji, koristi se za Authorization/apikey header. Nema novog secreta.
- **Živa definicija**: preview se prepisuje s diffom nad `pg_get_functiondef`, ne iz stare migracije (constraint iz mem/index).
- **RLS**: SELECT ograničen na članove kruga preko `krug_is_full_member`. Write puta iz klijenta nema (nema INSERT/UPDATE/DELETE policyja) — samo `service_role` piše.

## Redoslijed dispatcha (kad Milan kaže "gradi C1")

1. Jedna `supabase--migration`: tablica + grants + RLS + policy + izmjena `krug_settlement_preview` (na temelju live def) + kreiranje `krug_cron_freeze_fx_snapshots()` + revoke/grant na cron fn.
2. Jedna `supabase--insert` poziv: `cron.unschedule` (ako postoji) + `cron.schedule('0 3 1 * *', ...)`.
3. Manualni smoke: `SELECT public.krug_cron_freeze_fx_snapshots();` (kao service_role) za tekući `now()-1mj` — provjera `net._http_response`, provjera INSERT-a, provjera da idempotentno vraća `skipped>0` na re-run.
4. Manualni preview smoke: pozvati `krug_settlement_preview` za period koji ima snapshot → provjeriti `fx.frozen=true` i identične transfere prije/poslije freezea (byte-equal na round(6)).

## STOP-ovi (gdje se zaustavljam i javljam)

- Ako `exchange-rates` fn počne vraćati drugačiji shape od `{rates:{...}, date}` → ne pišem workaround, javljam.
- Ako `krug_notify_internal_key` u trenutku gradnje nije čitljiv kroz `vault.decrypted_secrets` iz cron fn konteksta → javljam prije nego se pišu radna rješenja.
- Ako preview živa definicija odudara od očekivanog (npr. netko je dodao lokalne CTE-ove za rate resolving) → javljam, ne gazim.

## Ne dirati u C1

- `krug_settlement_ledger`, `krug_expense_split_*`, `krug_income_ratio` — nula izmjena.
- `expenses`, salda, anchor, balance triggere, `custom_payment_sources`.
- Frontend (`useKrugSettlement`, `KrugSettlementSection`, dialozi) — nula izmjena.
- C2 (reminderi/push), C3 (PDF), C4 (invarijante) — ne diram.
