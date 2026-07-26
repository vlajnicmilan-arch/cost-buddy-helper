
## Krug Settlement — Faza B: izvedbeni plan

Nastavak Faze A (`krug_settlement_preview` RPC). NULA dodira na balance engine, `expenses` write put, anchor, `custom_payment_sources` ni jednu balance funkciju. Sve nove tablice su **zaseban settlement sloj** koji čita `expenses` samo read-only kroz SECURITY DEFINER RPC-e.

---

### 1. Migracija (schema-only, additive)

#### 1.1 `krug_settlement_ledger` — zabilježena podmirenja

```sql
CREATE TYPE public.krug_settlement_status AS ENUM ('settled','voided');

CREATE TABLE public.krug_settlement_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id        uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  from_user      uuid NOT NULL,           -- dužnik (plaća)
  to_user        uuid NOT NULL,           -- vjerovnik (prima)
  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  currency       text NOT NULL,           -- ISO 4217, isti kao settlement u trenutku klika
  status         public.krug_settlement_status NOT NULL DEFAULT 'settled',
  note           text,
  settled_at     timestamptz NOT NULL DEFAULT now(),
  settled_by     uuid NOT NULL,           -- tko je kliknuo "Označi podmireno"
  voided_at      timestamptz,
  voided_by      uuid,
  void_reason    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE INDEX ON public.krug_settlement_ledger (krug_id, status, settled_at DESC);
CREATE INDEX ON public.krug_settlement_ledger (krug_id, from_user, to_user, status);
```

**Bez `period_start/end` kolona.** Milanova odluka: mjesec se ne zaključava tvrdo. Ledger je čist tijek podmirenja; preview živog perioda oduzima cijelu zbroj-po-paru neovisno o mjesecu (§3).

Ne stavljamo `UNIQUE` na aktivne redove (jer korisnik može legitimno podmiriti isti par dva puta u istom mjesecu — npr. dvije rate). Zaštita od dvostrukog klika ide kroz **advisory lock u RPC-u + optimistic client debounce**, ne kroz DB unique.

#### 1.2 `krug_expense_split_override` — manual per-član udjeli

```sql
CREATE TABLE public.krug_expense_split_override (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id    uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,          -- član kojemu se pripisuje udio
  share_pct     numeric(6,3) NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, user_id)
);
CREATE INDEX ON public.krug_expense_split_override (expense_id);
```

**Zašto `share_pct` a ne `share_amount`:**
- Iznos troška se može editirati u budućnosti (typo fix). Postotak preživljava — 70% ostaje 70% bez retro-korekcije override tablice.
- Multi-currency safe: postotak je valuta-agnostičan, konverzija ide na razini settlement RPC-a.
- Validacija "sum == 100 ± 0.01" ide u **write RPC**, ne u CHECK constraint (CHECK ne može gledati druge redove).

`ON DELETE CASCADE`: ako se trošak obriše, override umire s njim. Ako se trošak retracta iz Kruga (`krug_privacy` promjena), override ostaje kao mrtav podatak — settlement ga jednostavno neće čitati (WHERE `krug_privacy='shared'`). Čisto.

#### 1.3 RLS + GRANT

```sql
-- ledger
GRANT SELECT ON public.krug_settlement_ledger TO authenticated;
GRANT ALL   ON public.krug_settlement_ledger TO service_role;
ALTER TABLE public.krug_settlement_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_full_members_read" ON public.krug_settlement_ledger
  FOR SELECT TO authenticated
  USING (public.krug_is_full_member(krug_id, auth.uid()));
-- NEMA insert/update/delete politike → sav write ide isključivo kroz SECURITY DEFINER RPC-e (§2).

-- override
GRANT SELECT ON public.krug_expense_split_override TO authenticated;
GRANT ALL   ON public.krug_expense_split_override TO service_role;
ALTER TABLE public.krug_expense_split_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY "override_full_members_read" ON public.krug_expense_split_override
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = expense_id
      AND e.krug_id IS NOT NULL
      AND public.krug_is_full_member(e.krug_id, auth.uid())
  ));
-- Write i za override ide isključivo kroz RPC (§2.3) — nema direct DML politike.
```

`updated_at` trigger na obje tablice (koristi postojeći `update_updated_at_column()`).

---

### 2. RPC-ovi (svi SECURITY DEFINER, `set search_path = public`, gate `krug_is_full_member`)

#### 2.1 `krug_settlement_mark_settled`

```
krug_settlement_mark_settled(
  p_krug_id   uuid,
  p_from_user uuid,
  p_to_user   uuid,
  p_amount    numeric,
  p_currency  text,
  p_note      text DEFAULT NULL
) RETURNS uuid  -- id novog ledger reda
```

Logika:
1. Gate: `krug_is_full_member(p_krug_id, auth.uid())` — inače `insufficient_privilege`.
2. Validacija: `p_from_user <> p_to_user`, oba `krug_is_full_member`, `amount > 0`, `currency ~ '^[A-Z]{3}$'`.
3. Advisory lock: `PERFORM pg_advisory_xact_lock(hashtext('krug_settle:'||p_krug_id::text||':'||least(p_from_user,p_to_user)::text||':'||greatest(...)::text))` — dvostruki klik čeka na prvog i vidi već-upisano stanje (klijent detektira duplikat kroz refetch, ne kroz DB error).
4. Insert red sa `status='settled'`, `settled_by=auth.uid()`.
5. Return `id`.

**Nije idempotentan po (from,to,amount,currency)** — Milanova odluka: povijest se gradi iz mark_settled zapisa, korisnik može legitimno podmiriti dvije rate iste vrijednosti.

#### 2.2 `krug_settlement_void`

```
krug_settlement_void(p_ledger_id uuid, p_reason text DEFAULT NULL) RETURNS void
```

1. `SELECT ... FROM krug_settlement_ledger WHERE id=p_ledger_id FOR UPDATE`.
2. Gate: `krug_is_full_member(krug_id, auth.uid())`.
3. Guard: `IF status='voided' THEN RAISE 'already_voided'`.
4. `UPDATE ... SET status='voided', voided_at=now(), voided_by=auth.uid(), void_reason=p_reason`.

Void = soft-poništeno (za auditsku povijest). Preview ga tretira kao da ne postoji.

#### 2.3 `krug_expense_override_upsert`

```
krug_expense_override_upsert(
  p_expense_id uuid,
  p_shares     jsonb   -- [{"user_id":"...","share_pct":70}, ...]
) RETURNS void
```

1. Lookup: `SELECT krug_id, user_id AS payer FROM expenses WHERE id=p_expense_id FOR UPDATE`; ako `krug_id IS NULL` → `RAISE 'not_krug_expense'`.
2. Gate: `krug_is_full_member(krug_id, auth.uid())`.
3. Validacija: svi `user_id` u `p_shares` su punopravni članovi Kruga (query `krug_membership` + `krug_ownership`); zbroj `share_pct = 100 ± 0.01`; nema duplikata.
4. Atomično: `DELETE FROM krug_expense_split_override WHERE expense_id=p_expense_id`; `INSERT ... FROM jsonb_to_recordset(...)`.
5. Prazan array `[]` = obriši override, vrati na default (krug.split_mode).

#### 2.4 Nema snapshot RPC-a

Milanova UX odluka: **nema tvrdog zaključavanja mjeseca.** Povijest = tijek `ledger` zapisa. `krug_settlement_snapshot` iz originalne skice se **briše iz opsega Faze B.** Ako se ikad zatreba (npr. PDF izvještaj), dolazi u Fazu C.

#### 2.5 Ažuriranje `krug_settlement_preview` iz Faze A

RPC već postoji (potpis `(uuid, date, date, text, jsonb) → jsonb`). Faza B ga proširuje da:

a) čita `krug_expense_split_override` per trošak i koristi te postotke umjesto default `split_mode` share-ova; ako override postoji ali je nepotpun (npr. samo 2 od 3 člana ubačena — teoretski ne moguće nakon validacije, ali defenzivno), fallback na equal + flag `partial_override_fallback`;
b) čita `krug_settlement_ledger WHERE status='settled'` **za cijeli Krug** (ne period-vezano) i računa `already_settled[from,to] = SUM(amount konvertiran u display_currency)`;
c) **prije greedy nettinga** oduzima settled iznose od netova: net-per-par se korigira. Konkretno:
   - Formiraj `net_matrix[i,j]` iz živog perioda (paid/owed).
   - Za svaki settled red `(from=A, to=B, amount=X)`: to znači "A je već platio B X" → smanjuje A-ov dug prema B. Efektivno: `net[A] += X`, `net[B] -= X`. (A više ne duguje toliko, B više ne prima toliko.)
   - Nakon korekcije, pokreni greedy netting nad novim netovima.
d) Response dobiva dva nova polja:
   - `settled_transfers`: lista već-podmirenih zapisa u periodu-neovisnom rasponu (za povijest tab).
   - `flags.has_overrides`: `true` ako bilo koji trošak u periodu ima override red.

**Rationale za "nije period-vezano":** ako se novi trošak pojavi 1. dana sljedećeg mjeseca, on ulazi u živi izračun tekućeg preview-a; ako korisnik gleda "prošli mjesec", već-podmireni transferi između istih ljudi svejedno smanjuju net. Live preview je uvijek "sve neriješeno između vas" filtrirano po prikaznom periodu troškova. Ovo je Milanov "još 12 € od zadnjeg poravnanja" model.

Update ide kroz `CREATE OR REPLACE FUNCTION` — obvezno krećemo od žive definicije (`pg_get_functiondef`) po memoriji `replace-function-start-from-live-def`.

#### 2.6 GRANT-ovi

```sql
REVOKE EXECUTE ON FUNCTION public.krug_settlement_mark_settled(...)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.krug_settlement_mark_settled(...)  TO authenticated;
-- isto za void i override_upsert
```

---

### 3. Frontend

#### 3.1 Manual override — inline u ExpenseEdit

**Plug točka:** `src/components/expense-edit/ExpenseEditForm.tsx` (ili ekvivalent — verificiram prije koda). Uvjet renderiranja: `expense.krug_id != null` i user je punopravni član tog Kruga.

Nova komponenta: `src/components/krug/KrugExpenseSplitPanel.tsx`
- Zatvoreni stanje: mala linija `Podijeli: {mod} ▾` gdje je `{mod}` ili "Jednako", "Prema prihodu", "Prilagođeno (Ti 70%, Petar 30%)".
- Otvoreni stanje (Collapsible): lista svih punopravnih članova s number input `%`, live suma i validacija "mora biti 100%". Gumbi: `Poništi override` (obriše sve), `Spremi` (poziva `krug_expense_override_upsert`).
- Preset gumbi: `Jednako 50/50`, `Sve na mene`, `Ostavi default`.
- Read-only preview za neovlaštene (ne-članove, workere) — ne renderira se uopće.

Hook: `src/hooks/useKrugExpenseOverride.ts` — `useQuery` za dohvat postojećeg override-a per expense + `useMutation` za upsert. Invalidira `['krug','settlement', krugId, ...]`.

#### 3.2 "Podmiri" gumb

Plug točka: `src/components/krug/KrugSettlementSection.tsx` — postojeći "Predloženi transferi" list (linije 199-219). Uz svaki transfer dodati gumb `Označi podmireno` (desno, ikona `Check`).

- Klik → confirm dijalog (`AlertDialog`): "Označiti kao podmireno: {from} → {to} {amount}?" + opcijski note textarea.
- Confirm → poziva `krug_settlement_mark_settled` mutation.
- Optimistic update: transfer nestaje s liste, ledger se refetcha.
- Debounce: gumb disabled 3s nakon klika (obrana od dvostrukog klika povrh advisory locka).
- Bilo koji punopravni član smije (server gate to potvrđuje).

Nova komponenta: `src/components/krug/KrugSettleTransferDialog.tsx`.

Hook: `src/hooks/useKrugSettlementMutations.ts` — `useMarkSettled`, `useVoidSettlement`, `useOverrideUpsert`.

#### 3.3 Povijest podmirenja

Nova komponenta: `src/components/krug/KrugSettlementHistory.tsx` — sekcija ispod transfera u `KrugSettlementSection`.
- Lista svih ledger zapisa Kruga (najnoviji prvo), grupirano po mjesecu.
- Svaki red: `{from} → {to}  {amount currency}  · {settled_at}  · {settled_by_ime}` + opcijski note.
- Voided zapisi: prikazani prekriženo, sa oznakom "Poništeno {voided_at}".
- Gumb `Poništi` (`Undo2` ikona) na svakom aktivnom redu — confirm dijalog → `krug_settlement_void`.
- Default collapsed (Collapsible sa "Povijest podmirenja ({count}) ▾").

Hook: `useKrugSettlementLedger(krugId)` — `useQuery` direct SELECT (RLS ionako filtrira).

#### 3.4 i18n

Nova grana `krug.settlement.settle.*`, `krug.settlement.override.*`, `krug.settlement.history.*` u hr/en/de (`src/i18n/locales/*.ts`). Konkretni ključevi:

- `settle.button`, `settle.confirmTitle`, `settle.confirmBody`, `settle.noteLabel`, `settle.success`, `settle.void`, `settle.voidConfirm`, `settle.voidReason`
- `override.title`, `override.panelHelp`, `override.presetEqual`, `override.presetAllOnMe`, `override.presetDefault`, `override.sumMustBe100`, `override.saveButton`, `override.clearButton`, `override.summaryLine` (npr. "Ti 70%, {name} 30%"), `override.badgeCustom`
- `history.title`, `history.emptyState`, `history.settledLine`, `history.voidedBadge`, `history.byUser`

#### 3.5 Push notif — **odgoditi u Fazu C**

Milan spomenuo kao pitanje. Prijedlog: **odgoditi.** Razlog: Faza B je već guste opsega (2 tablice, 3 RPC-a, override panel, povijest, void flow). Push je čista dodatnica — traži `push-notification` edge fn integraciju, `notification_preferences` grana i i18n za notif body. Bolje u Fazu C gdje ionako sjedi digest/reminder infrastruktura.

Ako Milan inzistira na Fazi B, dodajem naknadno kao 3.6 (server-side hook u `krug_settlement_mark_settled` koji `PERFORM net.http_post` na push edge fn).

---

### 4. Testovi

#### 4.1 Vitest — čista logika (`src/test/`)

- `krugSettlementOverride.test.ts` — validacija sum=100, presets, konverzija pct→amount pri renderiranju sažetka.
- `krugSettlementNetting.test.ts` — proširiti postojeći: input net + settled_transfers → očekivani net-nakon-poravnanja → transfers. Case: dva partial podmirenja, void, cross-currency settled iznos.

#### 4.2 SQL — `supabase/tests/krug/`

Nove datoteke:
- `settlement_mark_settled.sql` — 3 punopravna člana, insert ledger, provjeri da preview umanjuje net; non-member ne smije pozvati RPC (RAISES insufficient_privilege); dvostruki paralelni poziv → advisory lock serijalizira, oba završe, refetch pokazuje 2 reda (očekivano, ne unique-blocked).
- `settlement_void.sql` — void aktivan red, preview vraća net na staro; void već voided → RAISES `already_voided`; non-member void → gate fail.
- `settlement_override.sql` — upsert 70/30, sum≠100 → error; član-ne-član u shares → error; obriši override [] → preview vraća default equal split; expense delete → override cascade obriše.

#### 4.3 Balance regression policy

Faza B **ne aktivira** `supabase/tests/balance/` suite jer:
- Nema DDL/DML na `expenses`, `custom_payment_sources`, trigger-e balance-a, anchor-e.
- Nove tablice su izolirane; `expense_id` FK je ONLY-CASCADE-ON-DELETE (referencija, ne mutacija).

Ipak pokrećemo `detect-drift.sh` jednom prije/poslije da potvrdimo nula drifta u whitelistu.

---

### 5. Rizik-potvrda (Milanov zahtjev)

- ✅ `krug_expense_split_override` NE dira `expenses.amount`, `type`, `krug_privacy`, `krug_shared_status`. Samo READ FK.
- ✅ `krug_settlement_ledger` NE dira `expenses` uopće. Zaseban ledger.
- ✅ Balance engine (`recompute_balance_from_anchor`, triggeri na `expenses`, anchor RPC-i) — nula CREATE/ALTER/REPLACE.
- ✅ `custom_payment_sources` — nula dodira.
- ✅ Jedini pisci u nove tablice: 3 SECURITY DEFINER RPC-a. Direct DML zaključan (nema policy za INSERT/UPDATE/DELETE — RLS-om default deny).
- ✅ Preview je jedini čitatelj koji spaja override + ledger sa živim `expenses` podacima. Balance engine ništa od ovoga ne vidi.

---

### 6. Redoslijed implementacije kad Milan kaže "gradi"

1. Migracija (schema + RLS + GRANT + 3 nova RPC-a + izmjena `krug_settlement_preview`).
2. Regeneracija Supabase tipova (auto).
3. Frontend hooks (`useKrugExpenseOverride`, `useKrugSettlementMutations`, `useKrugSettlementLedger`).
4. `KrugExpenseSplitPanel` + integracija u ExpenseEdit.
5. `KrugSettleTransferDialog` + gumb u `KrugSettlementSection`.
6. `KrugSettlementHistory` sekcija.
7. i18n hr/en/de.
8. Vitest testovi.
9. SQL testovi.
10. Drift check.

---

### 7. Otvorena pitanja za Milana prije koda

1. **Push notif u Fazi B ili C?** Prijedlog: **C.** Potvrdi ili odbij.
2. **Void ovlast:** bilo koji punopravni član, ili samo `settled_by` autor + owner? Prijedlog: **bilo koji punopravni** (konzistentno s mark_settled ovlašću). Potvrdi.
3. **Override editing rights:** bilo koji punopravni član smije editirati override bilo kojeg krug-troška, ili samo autor troška (`expenses.user_id`)? Prijedlog: **bilo koji punopravni** (isti gate kao settle) — ali ako Milan želi restriktivnije, samo autor + owner je čist gate. Potvrdi.
4. **Ledger `currency`:** koristimo `settlement_currency` iz trenutka klika (snapshot). Ako se kasnije promijeni `krug.settlement_currency`, stari ledger red ostaje u svojoj valuti i preview ga konvertira kroz živi FX. OK ili tražiš re-denominaciju? Prijedlog: **snapshot, konvertiraj u previewu.**

Kad Milan odgovori i kaže "gradi" — dispatcham Fazu B.
