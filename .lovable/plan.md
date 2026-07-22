# Plan: Sidro / Reconciliation sloj

## Ključno otkriće (mijenja plan bitno)

**Sidro-model VEĆ POSTOJI u bazi.** Većina Milanovih odluka je već implementirana na razini SQL-a; nedostaje **UI za usklađivanje s bankinim saldom** i sitni polish. Dokazi:

- `custom_payment_sources.correction_anchor_date` + `correction_anchor_balance` (kolone već postoje — provjereno kroz `information_schema`).
- RPC `set_source_anchor(source_id, anchor_ts, anchor_balance, correction jsonb)` — apsolutna vrijednost, nije delta.
- Trigger `recompute_custom_source_balance()` (linije 1–92 žive definicije): `balance = anchor + SUM(post-anchor efekata)`, isključuje `expense_nature='correction'` i `deleted_at`. Podržava `day_cut` (produkcija) i `hybrid` mod preko `app_settings.anchor_engine_mode`.
- TS mirror: `src/lib/balance/anchorBalance.ts:70-105` (identična semantika, pokriveno regresijskim testovima).
- Guard: direktan UPDATE na `balance` blokiran mimo `app.balance_writer='engine'` markera.

---

## Odgovori s dokazom (A–F)

### A. Kako je "Korekcija salda" modelirana?

**Poseban expense red**, ne poseban tip:
- `expense_nature = 'correction'` (kolona na `expenses`).
- `payment_source = 'custom:<uuid>'`, `date = event_at = anchor_ts`, `time_confidence='C1'`, opis "Korekcija salda".
- Stvara se **isključivo kroz RPC `set_source_anchor`** (`p_correction` jsonb parametar), vidi živu definiciju linije 136–164.

**Apsolutna vrijednost sidra**: korisnik unosi "saldo JE X" — to je `p_anchor_balance`. Correction red je samo audit trag (iznos = razlika u trenutku snimanja), ali **ne utječe na izračun salda** jer ga `recompute` izostavlja (linije 49, 73 žive definicije). Sidro je jedina istina; correction red je vidljiv u povijesti da korisnik zna "tu sam napravio korekciju".

### B. Sukob s trigger-om? **Nema ga.**

Milanov postulat "trigger sumira sve" **nije istinit u trenutnoj bazi.** Recompute već poštuje sidro:
```
WHERE expense_nature <> 'correction'
  AND date > anchor_date   (day_cut)
  ILI
  AND event_at > anchor_ts (hybrid, C1/C2)
```

**Jedini stvarni gap:** ako novčanik nema sidro (`correction_anchor_date IS NULL`), recompute vraća NULL i saldo se održava starim delta modelom (`useBalanceUpdater.ts`, `writerIntent.ts`). To znači da postoje dvije klase novčanika: **sidrom-vođeni** (nova istina) i **delta-vođeni** (legacy).

**Preporuka (Opcija 1, najmanje invazivno, već 90% gotovo):**
1. **Ne mijenjati recompute** — semantika je točna.
2. **Auto-seed sidra** pri stvaranju novog novčanika: `anchor_ts = created_at`, `anchor_balance = initial_balance ?? 0`. Migracija: jednokratni backfill za sve postojeće novčanike bez sidra (`anchor_ts = updated_at`, `anchor_balance = balance` — snimamo trenutno stanje kao istinu).
3. Nakon toga **svi** novčanici su sidrom-vođeni, delta grana se može ukloniti u sljedećem PR-u.

Odbacujem Opciju 2 (rebalans delte pri svakom uvozu) — komplicira uvoz povijesnih redova, teško testirati, gubi audit trag.

### C. Provjera neslaganja bankinog i aplikacijinog salda

**Trenutno stanje:** executor upisuje `balance_after` u expense red (`executor.ts:290, 328`), ali **nema post-import reconciliation koraka** koji uspoređuje bankin završni saldo s aplikacijinim izračunatim saldom nakon uvoza. To je **glavni novi UI koji treba napraviti**.

**Prijedlog toka (nakon `Potvrdi uvoz`):**
1. Executor pročita `max(bank_row_seq)` red iz batch-a → `bank_final_balance = balance_after` tog reda.
2. Novi RPC `preview_source_balance_after_batch(source_id, batch_id)` vraća aplikacijin izračunati saldo (koristi istu logiku kao `recompute_custom_source_balance`).
3. Ako `|bank − app| > 0.01` → **Reconciliation dialog** s tri opcije:
   - **Uskladi na bankin saldo** → poziva `set_source_anchor(source, bank_ts, bank_balance, {amount: bank − app, description: "Automatska korekcija nakon uvoza"})`. Novo sidro na trenutku zadnjeg bankinog reda.
   - **Zadrži moj saldo** → nema akcije; snimi u `imported_statements.reconciliation_choice='kept_local'` (audit).
   - **Pogledaj detalje** → tablica: bankini reci s `balance_after`, aplikacijini reci koji nedostaju/viška su, sortirano po timeline.
4. Prag: **±0.01 €** (numeric(12,2) točnost). Prikaz razlike na 2 decimale.

### D. Retroaktivnost (postojeći Milanovi podaci)

**Ne mogu potvrditi bez ID-a korisnika u DB-u** (upit po emailu je pao — `profiles.email` ne postoji; treba upit preko `auth.users`). **Otvoreno pitanje za Milana:** trebam njegov user_id da provjerim jesu li "Revolut 106,43" i "Aircash 11,80" u bazi kao:
- (a) `set_source_anchor` pozivi → sidro postoji, ništa za raditi;
- (b) obični expense/income redovi s opisom "Korekcija" → nisu sidra, treba jednokratna migracija koja ih pretvara u sidra (uzme `date` kao anchor_ts, izračuna anchor_balance = ono što je saldo bio u tom trenutku).

Neovisno o tome — **backfill migracija iz koraka B2** će sve postojeće novčanike (uključujući Milanove) sidrom snimiti na trenutne salde. Milanove korekcije od jučer time postaju referentna točka istine.

### E. Rubovi

| Slučaj | Ponašanje |
|---|---|
| Više korekcija na istom novčaniku | Postoji **samo jedno polje** `correction_anchor_date` — nova korekcija prepisuje staru. **Zadnja pobjeđuje.** Stare correction expense redove ostaju kao povijest. |
| Transakcija s datumom **prije** sidra unesena kasnije | Recompute je automatski isključuje (date/event_at cut). **Ne dira saldo**, vidljiva u povijesti. Preporuka: **suptilan indikator** ("prije zadnje korekcije — ne utječe na saldo") na retku u listi, bez blokiranja unosa. |
| Brisanje sidra | **Nije modelirano.** Preporuka: eksplicitna akcija "Poništi sidro" → nulira anchor polja, pokreće delta recompute nad SVIM redovima novčanika. Rijetka akcija, iza potvrde s upozorenjem. |
| Uvoz redova s datumom prije sidra | Trenutno: šutke ide u povijest, ne utječe na saldo. Preporuka: brojka u reconciliation dialogu ("N redova prije zadnje korekcije, ne utječu na saldo"). |
| Draft/resume | Isti pattern kao ImportReview: `imported_statements.reconciliation_state jsonb` + banner "Nedovršeno usklađivanje". Beforeunload upozorenje ako je dialog otvoren. |

### F. Opseg i redoslijed

**Fáza 1 — DB temelj (1 migracija):**
- Auto-seed trigger na `custom_payment_sources INSERT`: `anchor_date=created_at`, `anchor_balance=initial_balance ?? 0`.
- Jednokratni backfill: `UPDATE custom_payment_sources SET anchor_date=updated_at, anchor_balance=balance WHERE anchor_date IS NULL`.
- Nova kolona `imported_statements.reconciliation_state jsonb NULL` za draft.
- Nova kolona `imported_statements.reconciliation_choice text NULL` (`'anchored'|'kept_local'|'skipped'`).

**Fáza 2 — Backend helpers:**
- Nova SQL funkcija `preview_source_balance_after_batch(source_id, batch_id) → jsonb` (bank_final_balance, app_final_balance, difference, rows_before_anchor_count).
- Postojeći `set_source_anchor` — bez izmjena, koristi se as-is.

**Fáza 3 — UI reconciliation (nakon executor.confirm):**
- `ReconciliationDialog` komponenta s 3 gumba (Uskladi / Zadrži / Detalji).
- Detalj view s tablicom bankinih vs aplikacijinih redova.
- i18n hr/en/de.
- Resume banner na dashboardu ako postoji `reconciliation_state` draft.
- Beforeunload guard tijekom dialoga.

**Fáza 4 — Sitni polish:**
- Indikator "prije sidra" na expense redu u listi.
- "Poništi sidro" akcija u novčanik-detail postavkama (iza potvrde).

**Fáza 5 — Testovi (kritično, ovo je novac):**
- SQL harness (`supabase/tests/balance/`): auto-seed sidra, preview_source_balance_after_batch, reconciliation choice paths.
- Vitest: `reconciliation.test.ts` — usporedba bank vs app, treshold 0.01, sve tri korisničke akcije, draft/resume.
- E2E (Playwright): uvoz PDF → reconciliation dialog → "Uskladi" → provjera novog sidra i salda.
- Regression test: transakcija s datumom prije sidra ne pomiče saldo.

---

## Otvoreno pitanje za Milana (blokira D)

Milane, treba mi tvoj user_id (ili email) da provjerim jesu li jučerašnje korekcije (Revolut 106,43 / Aircash 11,80) upisane kao **prava sidra** (kroz `set_source_anchor`) ili kao **obični redovi** koji tek trebaju postati sidra. Ostatak plana ne ovisi o tome — backfill iz F/Fáza 1 pokriva oba slučaja.

## Ne pipa se u ovom potezu

- Trigger `recompute_custom_source_balance` — semantika je već točna.
- `set_source_anchor` RPC — koristi se as-is.
- Anchor mirror `anchorBalance.ts` — bez izmjena.
- Model tipova expense (`type`, `expense_nature`) — bez izmjena.

Čekam Milanov OK za implementaciju + odgovor na otvoreno pitanje (D).
