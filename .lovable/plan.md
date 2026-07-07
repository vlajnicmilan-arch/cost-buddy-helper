# PR2 — Atomarni SET sidra (BUG 2 remediation)

**Cilj:** onemogućiti scenarij u kojem se `custom_payment_sources.correction_anchor_date/_balance` promijene bez pratećeg `recompute_custom_source_balance()`, čime `stored balance` privremeno divergira od engineove istine dok sljedeći write ne trigger-a recompute (BUG 2 / test A4).

Sve iz PR1 ostaje netaknuto. Ovaj PR **NE dira** trigger `expenses_event_at_sync`, `recompute_custom_source_balance`, `trg_expenses_recompute_source_balance`, `hybrid/day_cut` sematiku ni podatke.

---

## 1. Novi RPC `public.set_source_anchor`

**Potpis:**
```
set_source_anchor(
  p_source_id uuid,
  p_anchor_ts timestamptz,
  p_anchor_balance numeric,
  p_correction jsonb DEFAULT NULL
) RETURNS jsonb
```

**Ponašanje (u jednoj transakciji, tim redom, identično sadašnjem UI flowu):**
1. `SET LOCAL app.allow_anchor_write = 'on'` — otključava guard za trajanje ove transakcije.
2. Provjera vlasništva: `SELECT user_id FROM custom_payment_sources WHERE id = p_source_id` mora biti `= auth.uid()`. Ako ne, `RAISE insufficient_privilege`. (Ako uvedemo shared sources kasnije, dodat će se has_role/membership provjera — trenutno vlasnik = user_id, isti model kao postojeći UPDATE.)
3. `UPDATE custom_payment_sources SET correction_anchor_date = p_anchor_ts, correction_anchor_balance = p_anchor_balance, balance = p_anchor_balance, updated_at = now() WHERE id = p_source_id` — **anchor prvi**, isti timestamp kao u UI-u (`p_anchor_ts` klijentski `now()` — zadržavamo postojeći ugovor).
4. Ako je `p_correction` prisutan (razlika ≠ 0): `INSERT INTO expenses (...)` s `expense_nature='correction'`, `event_at=p_anchor_ts`, `time_confidence='C1'`, `user_edited_event_at=false`. Trigger na expenses će sam pozvati recompute jer je izvor sada anchored — ali za sigurnost:
5. `PERFORM recompute_custom_source_balance(p_source_id)` — eksplicitni završni recompute. Idempotentan (B8 test), garantira `stored == engine` prije nego RPC vrati.
6. `RETURN jsonb_build_object('id', p_source_id, 'balance', new_balance, 'anchor_ts', p_anchor_ts)`.

**Atributi:** `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = public`. `GRANT EXECUTE ON FUNCTION public.set_source_anchor(...) TO authenticated, service_role`. Bez granta anon.

**Zašto SECURITY DEFINER:** vlasnik funkcije (postgres) je izuzet iz guard triggera (vidi §2), pa RPC može upisati anchor kolone. Bez definer-a bi guard morao check-ati `current_setting`, što radi, ali definer daje nam čist "single door" kroz koji svi anchor writeovi prolaze.

---

## 2. Guard trigger `_prevent_direct_anchor_update`

**Definicija (BEFORE UPDATE OF correction_anchor_date, correction_anchor_balance ON custom_payment_sources FOR EACH ROW):**

Odbija UPDATE koji mijenja bilo koju od anchor kolona (`NEW.correction_anchor_date IS DISTINCT FROM OLD.correction_anchor_date` OR isti test za `_balance`) osim ako je zadovoljen jedan od uvjeta:

- `current_setting('app.allow_anchor_write', true) = 'on'` — RPC-set flag (jedini legitiman UI put).
- `current_user IN ('postgres', 'supabase_admin')` — vlasnik/migracije.
- `session_user = 'postgres'` — dodatni safety net za psql migracije.

Inače: `RAISE EXCEPTION 'anchor columns can only be modified via set_source_anchor()' USING ERRCODE = 'insufficient_privilege'`.

**Kolonska klauzula `UPDATE OF anchor_date, anchor_balance`:** trigger se ne aktivira za obični `UPDATE balance = ...` (kojeg radi recompute funkcija ili incremental delta trigger) — samo za direktne izmjene anchor kolona. Time recompute i incremental staza rade nepromijenjeno.

### Kako postojeće migracije/backfillovi rade s guardom

- Sve tri postojeće migracije koje UPDATE-aju anchor kolone (`20260624083605`, `20260624131214`, `20260630202419`) izvršene su davno i **ne pokreću se ponovno**. Nove migracije trče kao `postgres` role → automatski bypass kroz `current_user = 'postgres'` uvjet.
- SQL harness (`supabase/tests/balance/00_setup.sql`) trči kao `postgres` — bypass. Helper `pg_temp.set_anchor` nastavlja raditi.
- Ako se ubuduće piše nova admin migracija koja treba direktan UPDATE anchor kolona, ostaje mogućnost eksplicitnog `SET LOCAL app.allow_anchor_write = 'on'` u početku migracije — dokumentirati u `supabase/tests/balance/README.md`.

---

## 3. UI migracija — jedini call-site

`src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx:handleBalanceCorrection`:
- Zamijeniti trenutna dva izraza (`.from('custom_payment_sources').update({...anchor...})` + `.from('expenses').insert(correctionPayload)`) **jednim** pozivom:
  ```
  await supabase.rpc('set_source_anchor', {
    p_source_id: sourceId,
    p_anchor_ts: nowIso,
    p_anchor_balance: newBalance,
    p_correction: difference !== 0
      ? { amount: Math.abs(difference), type: correctionType, description, note }
      : null,
  });
  ```
- Ostatak (localMode grana, `onRefetchExpenses`, error handling) ostaje isti.
- `writerIntent.ts` promjena nije potrebna — `system_precise` intent više se ne koristi na ovom mjestu, ali helper i njegovi testovi ostaju (koristi ga scan-C1 producent).

**Backward compat (stariji klijent bez RPC-a):**

Rizik: user ima otvoren tab s prije-PR2 buildom, guard je aktivan → njihov "Ispravi saldo" gumb će failati (guard baca 42501). Mitigacija u dvije faze migracija u istom PR:

- **Faza A migracija** (deploy #1): kreiraj RPC `set_source_anchor` + kreiraj UI koji zove RPC. **Guard NE dodaj.** Deploy. RPC živi zajedno s novim UI-em, ali stari UI koji pokušava direktni UPDATE i dalje radi.
- **Faza B migracija** (deploy #2, ≥7 dana kasnije, nakon što je force-refresh cache-a većine klijenata isporučen): dodaj `_prevent_direct_anchor_update` guard trigger. Od tog trenutka stari raw-UPDATE putevi failaju s jasnom porukom.

Alternativa (jedan deploy): odmah guard + odmah RPC + UI. Cijena: mali prozor u kojem otvoreni prije-PR2 tabovi vide error "anchor columns can only be modified via set_source_anchor()". Ovaj tekst je prijateljski za support, ali radi user-visible failure dok korisnik ne refresha. **Preporuka: dvije faze**, ali odluku ostavljam tebi.

---

## 4. Test coverage

### Vitest (`src/lib/balance/__tests__/balanceRegression.test.ts`)
- Skinuti `it.skip` s A4 → invariant: nakon `setAnchor()` u mirroru, `balanceOf()` odmah vraća punu vrijednost (mirror već ima `setAnchor` s ugrađenim recomputeom; test već postoji kao skip). Očekivano PASS bez daljnjih izmjena mirror engine-a.
- Ostaviti `setAnchorBuggy` u mirroru — koristan za dokumentiranje bug-a, ali test A4 više ne poziva buggy varijantu.

### SQL suite (`supabase/tests/balance/10_scenarios.sql`)
- **A4 aktivacija:** `SELECT public.set_source_anchor(src_a, '2026-06-01 09:00:00+00', 500, NULL)` → `assert_eq('A4 stored == anchor after atomic SET', 500, pg_temp.bal(src_a))` **prije** ikakvog daljnjeg writea. Danas ovaj test u čistom UPDATE modelu FAIL-a — nakon PR2 PASS.
- **B9 novi guard test:** unutar svog `SAVEPOINT s_b9`, pokušaj `UPDATE custom_payment_sources SET correction_anchor_balance = 999 WHERE id = src_a` **bez** `SET LOCAL app.allow_anchor_write`. Očekivano: `EXCEPTION SQLSTATE '42501'`. Koristiti `DO $$ BEGIN ... EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS B9 guard blocks raw UPDATE'; RETURN; END $$; RAISE EXCEPTION 'FAIL B9 guard did not fire';`. Napomena: harness trči kao `postgres` (bypass), pa B9 treba privremeno `SET LOCAL role authenticated` unutar bloka da simulira klijentsku sesiju — ili alternativno `SET LOCAL session_authorization` na non-postgres rolu. Točan mehanizam dogovoriti prije pisanja koda.
- Dopuniti `supabase/tests/balance/README.md`: novi preduvjet — PR2 migracije `set_source_anchor` + guard trigger moraju biti primijenjene.

### CI (`.github/workflows/balance-sql-suite.yml`)
- Bez izmjena; workflow primjenjuje sve migracije po redu, uključujući PR2 migracije.

---

## 5. Redoslijed isporuke (deploy gate)

1. Vitest zeleno lokalno (A4 skip skinut).
2. SQL suite zeleno lokalno protiv PG16 s primijenjenim PR2 migracijama (A4 PASS, B9 PASS).
3. CI `balance-sql-suite.yml` zeleno na PR.
4. Faza A migracija (RPC + UI) → deploy.
5. Faza B migracija (guard trigger) → deploy nakon dogovorenog grace prozora.

Balance Regression Testing Policy iz PR1 vrijedi: bez zelene SQL suite nema merge-a.

---

## Otvorena pitanja prije koda

1. **Grace prozor za guard:** dvije faze (preporuka) ili jedna? Ako jedna, prihvaćaš user-visible failure za tabove otvorene prije deploya?
2. **Non-postgres rola u B9:** OK da guard test koristi `SET LOCAL ROLE authenticated` unutar SAVEPOINTa? Alternativa je zaseban SQL fajl `20_guard.sql` koji se pušta preko `psql -U <non_superuser>`.
3. **`p_anchor_ts` izvor:** klijentski `now().toISOString()` (zadržavamo trenutno ponašanje) ili server `now()` unutar RPC-a? Preporuka: klijent (retkompatibilnost s postojećim audit tekstom koji citira `nowIso`); ako pređemo na server, `p_anchor_ts` postaje optional s default `now()`.

Bez koda, bez migracija dok ne odobriš plan i odgovore na 3 pitanja gore.