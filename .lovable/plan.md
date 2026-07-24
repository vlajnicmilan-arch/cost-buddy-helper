# P0 Audit — Mapa Reconciliation Sustava (READ-ONLY)

Ništa nije mijenjano. Sve reference verificirane u repou.

---

## 1) Balance Anchor

**Nema `balance_anchors` tablice.** Sidro je skup kolona na `custom_payment_sources`.

| Kolona | Migracija | Napomena |
|---|---|---|
| `correction_anchor_date timestamptz` | `20260624083605_*.sql:3-5` | ISO timestamp sidra |
| `correction_anchor_balance numeric(12,2)` | isto | saldo u trenutku sidra |
| `anchor_source anchor_source_type` | `20260722180051_*.sql:12-24` | enum tag porijekla |
| `balance` | (postojeća) | prikazni saldo, prepisan iz recomputea |

**Enum `public.anchor_source_type` (4 vrijednosti):**
- `'user_confirmed'` — korisnik ručno postavio (Balance Correction dialog)
- `'migration'` — backfill za postojeće račune (Faza 1)
- `'bank_reconciliation'` — prihvaćen bankin završni saldo (`align_source_to_bank`)
- `'system_initial'` — auto-seed pri INSERT-u novog računa (`trg_cps_autoseed_anchor`)

**Audit trail:** `public.anchor_audit` (`20260722180051_*.sql:27-53`) — svaka promjena sidra loga se s old/new vrijednostima + reason + actor. RLS: "Users view own anchor audit".

**TS strana:** enum i kolone dostupne samo kroz generirani `src/integrations/supabase/types.ts` i UI `src/components/custom-payment-sources/AnchorInfoSection.tsx`. `src/types/customPaymentSource.ts` NE eksponira anchor polja (samo `balance`).

---

## 2) Balance Kalkulacija

**Single source of truth (SQL):** `public.recompute_custom_source_balance(p_source_id)`
- Definicija: `20260624083605_*.sql:23-97` (originalna), izmijenjena u `20260628205415_*.sql:45-99` (no-op ako nema sidra, delta putanja u triggeru preuzima taj slučaj).
- Formula: `new_balance = correction_anchor_balance + SUM(post-anchor rows)` gdje "post-anchor" znači `(e.date AT TIME ZONE 'UTC')::date > (anchor_date)::date`.
- Isključuje: `deleted_at IS NOT NULL`, `expense_nature = 'correction'`.

**Trigger:** `trg_expenses_recompute_source_balance` (`20260630202419_*.sql:4-94`)
- `AFTER INSERT/UPDATE/DELETE ON expenses`
- Ako je izvor sidren → puni `recompute_custom_source_balance`.
- Ako NIJE sidren → inkrementalni +/- delta iz OLD/NEW (izbjegava full-scan).
- Deterministic lock order dodan u `20260713100009_*.sql` (`FOR UPDATE` + ORDER BY protiv lost update-a).

**TS mirror (test-only):** `src/lib/balance/anchorBalance.ts:1-105`, `computeAnchoredBalance()`
- Dokumentirano kao "MUST NOT be imported by runtime code paths". Koristi ga isključivo SQL parity suite (`sqlParity.test.ts`).
- Podržava dva engine mode-a: `day_cut` (default, produkcija) i `hybrid` (per-row cut po `time_confidence` C1–C4, opt-in preko `app_settings.anchor_engine_mode`).

**Konzumenti balansa:**
- `src/hooks/useBalanceUpdater.ts:60-67` — u cloud modu SAMO čeka trigger (nema klijentske matematike). Local/IndexedDB mod (`:44-59`) i dalje ručno ažurira balans.
- UI: `src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx:72-153`, `Wallet.tsx`, `BusinessWallet.tsx`, `PaymentSourcesFullScreenView.tsx`, `ProjectTransactionsTab.tsx`, `useExpenseCRUD.ts`.

---

## 3) Merge Logika

**Ključna datoteka:** `src/lib/importReview/executor.ts` (header 1-40 opisuje cijelu shemu).

**Dedup mehanizam (dvoslojni):**

1. **Fingerprint (deterministic):** `src/lib/importFingerprint.ts` — `computeImportFingerprint({userId, paymentSource, date, type, amount, description, merchantName})` → `imp:<sha256>`. Normalizacija: opis lowercase+NFD, datum `YYYY-MM-DD`, iznos `.toFixed(2)`. Rezultat se upisuje u `expenses.bank_transaction_id`.

2. **DB unique index:** `uniq_expenses_user_bank_tx (user_id, bank_transaction_id) WHERE bank_transaction_id IS NOT NULL` — garantira idempotentni re-import.

**Merge state machine — `expenses.bank_match_status`:**
- `'manual'` — korisnički ručno unesen red, još nije spojen s bankinim.
- `'confirmed'` — ručni red spojen s bankinim uvozom (isti `bank_transaction_id`).
- `'bank_only'` — samo iz izvoda, nema ručnog parnjaka.

**MERGE grana** (`executor.ts:275-330`):
```
UPDATE expenses SET bank_transaction_id=?, bank_match_status='confirmed'
WHERE id=manualId AND bank_transaction_id IS NULL
```
Guard `bank_transaction_id IS NULL` znači: drugi run pronađe 0 redaka i broji `skippedMerged` → race-safe i idempotentno.

**NEW/TRANSFER grana** (`~361-369`): bulk `upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true })` — DB odbija duplikate, balans se ažurira SAMO za stvarno umetnute redove.

**Viši sloj:** `src/lib/reconciliation/{actions,queue,resume}.ts` — reconciliation queue i UI odluke iznad executora (nije čitano red po red).

---

## 4) Korekcijske Transakcije

**Model:** `public.expenses.expense_nature = 'correction'` (nije poseban `type`; `type` ostaje `income`/`expense` ovisno o predznaku razlike).

**Write path:** RPC `public.set_source_anchor(p_source_id, p_anchor_ts, p_anchor_balance, p_correction jsonb)` (`20260722180051_*.sql:187-286`) atomarno:
1. Postavi `correction_anchor_date/balance` na `custom_payment_sources`.
2. Update-a `balance` kolonu.
3. Postavi `anchor_source = 'user_confirmed'`.
4. Loga u `anchor_audit`.
5. Opcionalno umetne correction red u `expenses` (`expense_nature='correction'`, `event_at`, `time_confidence='C1'`).
6. Poziva `recompute_custom_source_balance`.

**UI ulaz:** `src/components/custom-payment-sources/BalanceCorrectionDialog.tsx` → `CustomPaymentSourcesPanel.tsx:72-153` → RPC.

**Isključivanje iz anchor sume:** filter `COALESCE(expense_nature,'regular') <> 'correction'` primijenjen u:
- SQL recompute: `20260628205415_*.sql:83`
- SQL delta trigger: `20260630202419_*.sql:32,39,60,72` (`NOT v_old_is_correction`, `NOT v_new_is_correction`)
- TS mirror: `src/lib/balance/anchorBalance.ts:78`

**Delete guard:** `src/lib/correctionDeleteGuard.ts` + `src/components/CorrectionDeleteConfirmHost.tsx` — sprječava brisanje correction reda bez rekonstrukcije sidra (detalji nisu čitani red po red).

---

## 5) Import Idempotentnost

**File-level (per izvod):** tablica `public.imported_statements` (`20260520050454_*.sql:2-27`)
- Kolone: `file_hash`, `content_hash`, `file_name`, `file_size`, `mime_type`, `transactions_count`, `import_batch_id`, `reconciliation_state`, `reconciliation_meta`.
- Unique partial indexi: `uniq_imported_statements_user_filehash (user_id, file_hash) WHERE file_hash IS NOT NULL` i `uniq_imported_statements_user_contenthash` — dupli upload iste datoteke blokiran na DB nivou.

**Row-level (per transakciju):** `bank_transaction_id` fingerprint (vidi točku 3).

**Draft/pending save:** `src/lib/importReview/draft.ts` (state prije commita), state machine `src/lib/importReview/state.ts` + `types.ts`, orkestracija `executor.ts`.

**"Poništi uvoz" flow:** RPC `public.undo_import_batch(p_batch_id)` (`20260722203338_*.sql:13-171`)
1. Ownership check (`:37-62`).
2. Unmerge `confirmed` redaka: čisti `bank_transaction_id`, vraća `bank_match_status='manual'`, čisti `import_batch_id` (`:82-93`) — oslobađa fingerprint za novi uvoz.
3. Hard-delete `bank_only` redaka i transfera (`:96-115`).
4. Briše `imported_statements` red → oslobađa `file_hash`/`content_hash` (`:118-124`).
5. Telemetrija: `import_undone` event (`:138-156`).
6. Idempotentna: drugi poziv vraća `already_undone: true` (`:127-135`).
7. **Ne dira anchor kolone ni `anchor_audit`** ("Option A", komentar `:172-173`) — ako je između uvoza bilo `align_source_to_bank`, sidro ostaje.

**TS wrapper:** `src/lib/importReview/undoBatch.ts` → `src/components/ImportBatchDialog.tsx`, `ImportBatchDialogHost.tsx`.

---

## 6) Migracijski Anchori

Kronološki:

| Migracija | Radnja |
|---|---|
| `20260624083605_*.sql:142-186` | Prvi backfill — postavlja `correction_anchor_date/balance` iz najnovijeg `expense_nature='correction'` reda po izvoru. Bez `anchor_source` tag-a (enum ne postoji). |
| `20260630202419_*.sql:2-42` | Revert/clear svih sidara osim jednog hardkodiranog wallet ID-a. Recompute postaje no-op kad nema sidra. |
| `20260713100009_*.sql:1-46` | Regex backfill — parsira HR bilješke `"Saldo korigiran s X na Y"` da rekonstruira sidra. Guarded s consistency check-om, samo za `correction_anchor_date IS NULL`. |
| `20260722180051_*.sql` **("FAZA 1 SIDRO/RECONCILIATION TEMELJ") — glavna** | Vidi ispod. |
| `20260722185218_*.sql` ("FAZA 2") | RPC `align_source_to_bank`, taguje nova sidra `'bank_reconciliation'` (`:159-176`), idempotency guard protiv posljednjeg audit reda (`:133-144`). |

**Faza 1 detalj (`20260722180051_*.sql`):**
- `:12-24` — enum `anchor_source_type` + kolona `anchor_source` na `custom_payment_sources`.
- `:27-53` — `anchor_audit` tablica + RLS.
- `:56-60` — tagira **već sidrene** izvore kao `'user_confirmed'`.
- `:67-121` — **backfill svih preostalih**: računa `anchor_balance = current_balance − SUM(post-anchor tx)`, `anchor_date = min_tx_date − 1 dan` (ili `created_at`), taguje `'migration'`. Idempotency-guarded (`anchor_source IS NULL`). Svaki upis loga se u `anchor_audit`.
- `:139-183` — `trg_cps_autoseed_anchor` (`BEFORE INSERT`) auto-seed novih računa s `anchor_source='system_initial'` + audit trigger.
- `:288-301` — `reconciliation_state_type` enum + `reconciliation_state`/`reconciliation_meta` kolone na `imported_statements`.

---

## Otvorena područja (nije čitano red po red, kandidati za sljedeći pass)

- `src/lib/reconciliation/{actions,queue,resume}.ts` — reconciliation UX i queue logika.
- `src/lib/correctionDeleteGuard.ts` — točan uvjet zaštite correction redova od brisanja.
- `src/lib/balance/{balanceEngineMirror,tierMerge,writerIntent,eventAtTrigger,decideScanTier}.ts` — "Val" precision engine iznad anchor modela (`time_confidence` C1–C4, hybrid mode).
- Live vrijednost `app_settings.anchor_engine_mode` (`day_cut` vs `hybrid`) — treba DB query da se potvrdi produkcijsko stanje.

---

**Ovo je mapa. Ne mijenjam ništa. Reci koje od otvorenih područja želiš da mapiram sljedeće ili idemo na konkretan popravak.**
