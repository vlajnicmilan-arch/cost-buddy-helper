
# Faza C4 — Krug settlement SQL invariant template (PRIJEDLOG)

Ovo je **prijedlog izvedbe** — čeka Milanov "gradi C4". Nula migracija, nula RPC-ova, nula edge funkcija, `touches_balance=false`. Samo jedna nova **template** datoteka istog stila kao `supabase/tests/krug/governance_flow.sql`.

## Opseg

Nova datoteka: `supabase/tests/krug/settlement_invariants.sql`

- Manualni template — NE izvršava se u CI-ju, NE dispatcha se, NE dira produkciju.
- `BEGIN ... ROLLBACK` cijeli sadržaj → rollback-safe by design.
- Zahtijeva dev-cluster gdje izvršavajuća rola ima USAGE na `auth` schema (ista napomena kao u `governance_flow.sql`).
- Ulaz preko `psql -v` varijabli: `krug_id`, `owner_id`, `other_id`, `third_id`, `period_start`, `period_end`.
- Svaka invarijanta u zasebnom `DO $$ ... $$` bloku s `RAISE NOTICE 'PASS Ix ...'` ili `RAISE EXCEPTION 'FAIL Ix ...'`.

## Header (a/b/c/d klauzule, isti stil kao Faza B)

```text
a) Requires dev cluster with auth schema USAGE (auth.uid() u SECURITY DEFINER RPC-ovima).
b) Cijeli sadržaj u BEGIN...ROLLBACK — nula perzistencije.
c) Pokriva 5 read-only invarijanti settlement enginea; NE mijenja balance,
   NE piše u ledger, NE poziva mark_settled/override_confirm.
d) NE pokretati protiv produkcije — koristi sintetičke UUID-ove kreirane
   izvan transakcije (fixtures) ili već postojeći dev-krug s test podacima.
```

Dodatno preflight (mirrors govern.flow):
- `SELECT count(*)` prije/poslije za `krug_settlement_ledger`, `krug_expense_split_override`, `krug_expense_split_share`, `krug_settlement_fx_snapshot` → mora biti identičan (dokaz da su svi pozivi read-only).
- `SELECT count(*) FROM pg_locks WHERE granted = false` prije i poslije → 0 = 0 (ne držimo blokade).

## Invarijante — SQL skica

### I1. Balance sum (paid ≡ owed po periodu)
```sql
WITH r AS (
  SELECT public.krug_settlement_preview(
    v_krug, v_period_start, v_period_end, 'EUR', '{}'::jsonb
  ) AS j
),
tot AS (
  SELECT
    (SELECT sum((m->>'paid')::numeric) FROM r, jsonb_array_elements(j->'members') m) AS paid,
    (SELECT sum((m->>'owed')::numeric) FROM r, jsonb_array_elements(j->'members') m) AS owed,
    (SELECT jsonb_array_length(j->'members') FROM r) AS n
  FROM r
)
SELECT abs(paid - owed) <= 0.02 * n FROM tot;  -- FX rounding tolerance
```
FAIL ako razlika > `0.02 * broj_članova`.

### I2. Settled ≤ owed (po paru from→to)
Za svaki `transfer` iz preview outputa: `sum(ledger.amount) FILTER (WHERE voided_at IS NULL)` za taj (krug, from_user, to_user, currency, period) `<=` `transfer.amount + 0.01`. Ako nema transfera, ledger za par mora biti 0.

### I3. FX snapshot immutabilnost
```sql
-- Ako postoji snapshot za period:
v_p1 := public.krug_settlement_preview(v_krug, v_ps, v_pe, 'EUR', '{}');
v_p2 := public.krug_settlement_preview(v_krug, v_ps, v_pe, 'EUR', '{}');
-- Normaliziraj transfere na round(6) i usporedi jsonb_agg ORDER BY from,to
```
Također potvrditi da odgovor sadrži `fx.frozen = true` kad postoji snapshot za taj (krug, period, display_currency).

### I4. Override integritet (multi-sig)
Za svaki `krug_expense_split_override` sa `status='potvrdjena'`:
- Broj punopravnih članova `krug_membership WHERE role IN ('owner','full')` **osim** `proposed_by`.
- Broj `krug_expense_split_confirmation` za taj override.
- Prvi = drugi (predlagatelj se auto-računa, ostali svi punopravni potvrdili).

### I5. Ledger non-negativity
```sql
SELECT krug_id, from_user_id, to_user_id, currency,
       sum(amount) FILTER (WHERE voided_at IS NULL) AS net
FROM public.krug_settlement_ledger
WHERE krug_id = v_krug
GROUP BY 1,2,3,4
HAVING sum(amount) FILTER (WHERE voided_at IS NULL) < 0;
```
FAIL ako bilo koji redak → negativna neto suma znači "voidano više nego zapisano".

## Što ovaj korak NE radi

- Ne pokreće se ni ručno ni automatski.
- Ne dispatcha edge funkcije, ne pravi cron.
- Ne mijenja `run-all.sh`, ne dodaje CI korak, ne dira stress harness.
- Ne stvara fixtures loader — koristi već postojeći dev krug (Milan pokreće ručno kad odluči).

## Verifikacija nakon commita (kad Milan kaže "gradi")

- `wc -l` na novoj datoteci.
- Grep dokaz: `git grep -n "settlement_invariants.sql"` vraća SAMO tu datoteku (nije nigdje pozvana).
- Napomena Milanu: "template only, run manually na dev clusteru s `psql -v`".

Reci **"gradi C4"** za izvedbu, ili navedi izmjene.
