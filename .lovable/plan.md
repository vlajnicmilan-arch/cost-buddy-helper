## Faza A — Krug settlement read-only temelj

Cilj: read-only preview "tko kome koliko", multi-currency-aware od početka, sva 3 split moda, bez ijednog dodira balance enginea ili `expenses` write puta.

---

### 1. Potvrđeno stanje (query, ne pretpostavka)

- `krug` kolone: `id, name, preset, lifecycle_state, created_by, created_at, updated_at, deleted_at, deleted_by` — **nema** `split_mode` ni `settlement_currency`.
- `krug_membership.role` postoji (enum `punopravni|obicni` po memoriji).
- `krug_shared_payment_source(krug_id, payment_source_id, linked_by, linked_at)` — bez currency polja (currency živi na `custom_payment_sources.currency`).
- `expenses.currency` postoji per-row → izvor istine za valutu troška.
- **Income split governance ne postoji** — nema `family_income_ratios`, `income_split`, `governance`. Stara `compute_family_income_ratio` funkcija je zombie nad obrisanim `family_groups`. Za `proportional_income` mod moramo definirati NOVI izvor omjera.

### 2. Migracija (schema-only, additive)

Nova enum + 2 kolone na `krug` + 1 nova tablica za per-Krug income omjere:

```sql
CREATE TYPE public.krug_split_mode AS ENUM ('equal','proportional_income','manual');

ALTER TABLE public.krug
  ADD COLUMN split_mode public.krug_split_mode NOT NULL DEFAULT 'equal',
  ADD COLUMN settlement_currency text;  -- NULL = auto-derive iz prvog shared sourcea

CREATE TABLE public.krug_income_ratio (
  id uuid PK, krug_id uuid FK→krug, user_id uuid FK→auth.users,
  weight numeric(10,4) NOT NULL CHECK (weight >= 0),
  effective_from date NOT NULL DEFAULT current_date,
  created_at, updated_at,
  UNIQUE (krug_id, user_id, effective_from)
);
-- GRANT authenticated + service_role; RLS: full members read, only owner write
```

Manual override per-transakciju: **NE** dodajemo kolonu na `expenses` u Fazi A (rizik za balance policy triggere). Manual override ide u Fazu B kao zaseban `krug_expense_split_override(expense_id, user_id, share_amount)` ledger. U Fazi A "manual" mod se ponaša kao "equal" fallback + UI badge "Manual overrides dolaze u sljedećoj fazi".

**Nula izmjena** na `expenses`, `custom_payment_sources`, triggerima balance enginea, anchor sustavu.

### 3. RPC `krug_settlement_preview`

```
krug_settlement_preview(
  p_krug_id uuid,
  p_period_start date,
  p_period_end date,
  p_display_currency text DEFAULT NULL  -- NULL = koristi krug.settlement_currency
) RETURNS jsonb
```

SECURITY DEFINER, `search_path = public`, gate: `IF NOT public.krug_is_full_member(p_krug_id, auth.uid()) THEN RAISE insufficient_privilege`.

**Algoritam:**
1. Učitaj shared troškove: `expenses WHERE krug_id=? AND krug_privacy='shared' AND krug_shared_status='potvrdjena' AND deleted_at IS NULL AND type='expense' AND date::date BETWEEN p_period_start AND p_period_end`.
2. Odredi članove: svi `krug_membership` s rolom `punopravni` (+ owner iz `krug_ownership`).
3. Odredi split omjere prema `krug.split_mode`:
   - `equal` → 1/N po članu.
   - `proportional_income` → čita `krug_income_ratio` sa najkasnijim `effective_from ≤ period_end` per user; ako neki član nema zapis → fallback equal + flag `missing_income_data` u response.
   - `manual` → identično `equal` u Fazi A (Faza B čita override tablicu).
4. Za svaki trošak:
   - `payer_user_id = expenses.user_id` (tko je zaveo trošak; shared source vlasništvo NE mijenja payera — payer je onaj koji je fizički platio).
   - Konvertiraj `amount` iz `expenses.currency` u `display_currency` kroz FX (vidi §4).
   - `owed[member] += converted_amount × share[member]`, `paid[payer] += converted_amount`.
5. `net[u] = paid[u] − owed[u]`. Pozitivan = duguje mu se; negativan = duguje.
6. **Greedy netting** u SQL-u (rekurzivan CTE ili PL/pgSQL loop): sort po netu, spoji najvećeg dužnika s najvećim vjerovnikom, ponavljaj do ≤ ε (0.01).

**Response shape:**
```json
{
  "krug_id":"...", "period_start":"2026-07-01", "period_end":"2026-07-31",
  "display_currency":"EUR",
  "split_mode":"equal",
  "members":[{"user_id":"...","paid":123.45,"owed":67.89,"net":55.56}],
  "transfers":[{"from_user":"...","to_user":"...","amount":55.56,"currency":"EUR"}],
  "fx":{"rates_used":{"USD→EUR":0.92,"HRK→EUR":0.1327},"snapshot_date":"2026-07-31","source":"frankfurter.app"},
  "flags":{"missing_income_data":false,"manual_mode_fallback_equal":false,"mixed_currencies":true}
}
```

### 4. Multi-currency u Faza A (temelj koji C nadograđuje)

- **Display currency:** `krug.settlement_currency` (postavljen pri prvom preview-u iz valute najstarijeg shared sourcea; user može override kroz UI kasnije).
- **FX izvor:** postojeći `exchange-rates` edge fn (frankfurter.app, ECB mid-rate, cache 1h) — već koristi `useExchangeRates`. RPC ga NE zove direktno (edge fn je HTTP-only). Umjesto toga: klijent dohvaća rate mapu i **prosljeđuje je RPC-u kao `p_fx_rates jsonb`** parametar. RPC koristi rates deterministički (snapshot per poziv).
- Response uključuje `fx.rates_used` + `snapshot_date` da UI može reproducirati / prikazati "FX na dan X".
- Faza C dodaje: perzistentni per-period FX snapshot u `krug_settlement_fx_snapshot` tablicu (za immutability povijesnog izračuna).

**Ažurirana RPC potpisu:**
```
krug_settlement_preview(p_krug_id, p_period_start, p_period_end,
                        p_display_currency text, p_fx_rates jsonb)
```

### 5. Frontend

- `src/lib/krugSettlement.ts` — čisti helperi (bez React/supabase importova):
  - `greedyNetting(nets: {userId:string, net:number}[], epsilon=0.01): Transfer[]`
  - `computeEqualShares(memberIds, amount): Record<string,number>`
  - `computeProportionalShares(memberIds, weights, amount): Record<string,number>`
  - Sve testabilno u vitestu.
- `src/hooks/useKrugSettlement.ts` — `useQuery(['krug','settlement', krugId, periodStart, periodEnd, displayCurrency])`, poziva FX hook, zatim RPC.
- `src/components/krug/KrugSettlementSection.tsx` — plugin u `KrugDetailScreen` (novi tab ili sekcija ispod članova):
  - Period selektor (default: tekući kalendarski mjesec + prev/next arrows)
  - Display currency selektor (default: `krug.settlement_currency`)
  - Tablica per-član: paid / owed / net (obojeno)
  - Lista predloženih transfera "A → B: X EUR"
  - Info banner: split mode, FX snapshot date, flagovi
  - **Bez ijednog write gumba u Fazi A.** "Označi podmireno" gumb dolazi u Fazi B.
- `src/components/krug/KrugSettingsDialog.tsx` (ako postoji, ili novi) — polje za split mode + display currency (owner only). Ako `proportional_income` → tab za unos weightova per član (piše u `krug_income_ratio`).
- i18n: novi ključevi u `krug.settlement.*` (hr/en/de):
  - `title, period, previous, next, member, paid, owed, net, transfers, transferLine, splitMode.equal, splitMode.proportional_income, splitMode.manual, manualFallbackNotice, fxNotice, missingIncomeNotice, mixedCurrenciesNotice`

### 6. Testovi

- **Vitest** (`src/test/krugSettlement.test.ts`):
  - `greedyNetting` — 2/3/N članova, edge case svi na nuli, edge case jedan član drži sve, epsilon rounding.
  - `computeEqualShares` — sum rekonstrukcija = amount ± epsilon.
  - `computeProportionalShares` — omjeri, null weight fallback.
- **SQL smoke** (`supabase/tests/krug/settlement_preview.sql`):
  - Setup: 3 usera, Krug, shared source, 3 troška (mix currencies), pozovi RPC → provjeri strukturu response-a, sum invariante (`sum(paid) == sum(owed)`), non-member ne smije pozvati.

### 7. Redoslijed Faza B i C (naznaka)

**Faza B (ledger + interakcija):**
- Migracija: `krug_settlement_ledger(id, krug_id, period_start, period_end, from_user, to_user, amount, currency, status enum, settled_at, settled_by, note)` + `krug_expense_split_override(expense_id, user_id, share_amount)` + RLS.
- RPC: `krug_settlement_snapshot(...)` (freeze period), `krug_settlement_mark_settled(transfer_id, note)`, `krug_settlement_void(transfer_id)`.
- Frontend: "Podmiri" gumb, povijest tab, snapshot flow, manual override UI u ExpenseEdit.
- Concurrency: `FOR UPDATE` + unique constraint.
- Push notif: primatelj kad je transfer označen settled.

**Faza C (automatizacija + izvještaji):**
- pg_cron: mjesečni auto-snapshot na kraju perioda (kroz `net.http_post`, ne migration).
- `krug_settlement_fx_snapshot` — perzistentni FX rates per period.
- `notification_preferences` polje za weekly digest "imaš 3 nepodmirene stavke".
- Reminder edge fn (dnevni/tjedni).
- PDF export edge fn (novi layout, stari `familySettlementPdf.ts` je obrisan).
- SQL invariant testovi za balance-invariants radar.

---

### 8. Potvrđeni rizici / non-goals

- ✅ Faza A NE dira: `expenses` write put, balance triggere, anchor sustav, `custom_payment_sources` ni jednu balance funkciju. **Balance regression testing policy (balance-regression-testing-policy) se NE aktivira** jer nema DDL/DML nad tim putovima.
- ✅ RLS gate: settlement čita `expenses` isključivo kroz `krug_is_full_member` u SECURITY DEFINER RPC — ne otvara nove RLS grane na `expenses`.
- ⚠️ **Otvoreno pitanje za Milana prije koda:**
  - **Income ratio governance:** predlažem novu `krug_income_ratio` tablicu (per-Krug weightovi, owner postavlja). Alternativa: čitati iz `income_sources` (ali tamo nema amount/weight polja pa je to non-starter). **Potvrdi ili odbij.**
  - **Manual mod u Fazi A:** ponašanje = equal + notice banner (override dolazi u Fazi B). **OK ili želiš odgoditi cijeli `manual` do B?**
  - **Payer semantika:** payer = `expenses.user_id` (tko je zaveo). Alternativa: vlasnik payment sourcea. Ovo je važno kod shared sourcea. **Potvrdi.**

Kad Milan odgovori na ta 3 pitanja i kaže "gradi" — dispatch Faza A.
