## Cilj
Auto-merge ručno unesenih transakcija s redovima iz bankovnog izvoda (CSV/PDF) pri uvozu, uz **±1 dan + isti iznos + isti izvor + isti tip**. Mergeani redovi ostaju vidljivi u dijalogu "Izvod" s posebnom oznakom. Brisanje izvoda unmerga ručne unose umjesto da ih briše.

## A) Auto-merge logika pri uvozu

**Helper** `src/lib/manualMatchForImport.ts` (pure, no React/Supabase):
- `matchManualToImported({imported, manualCandidates, maxDayDiff: 1})` → `{matches: [{importedIdx, manualId}], ambiguous: number[], unmatched: number[]}`
- Match kriteriji: isti `payment_source`, isti `type` (expense/income, transfer preskoči), isti `amount` (`.toFixed(2)`), `|date − importedDate| ≤ 1 dan`.
- 1:1 match → merge. 0 ili ≥2 kandidata → ne spaja (ide kao novi).

**Test** `src/lib/manualMatchForImport.test.ts` — pokriva same-day, ±1d granicu, 2d → no match, ambiguous (2 kandidata), transfer skip, različit izvor.

**Patch** `src/hooks/useExpenseCRUD.ts` (cloud grana `importFromCSV`, ~459–580):
1. Prije `upsert`: SELECT manual kandidata iz DB (jedan query za cijeli batch):
   - `user_id = me`, `payment_source IN (importedSources)`, `type IN ('income','expense')`,
   - `date BETWEEN minDate-1 AND maxDate+1`,
   - `bank_transaction_id IS NULL`, `bank_match_status IN ('manual','pending_bank')`, `deleted_at IS NULL`.
2. Pozovi helper → `matches` / `ambiguous` / `unmatched`.
3. Za svaki match → UPDATE s guardom:
   ```
   UPDATE expenses
   SET bank_transaction_id = <fp>,
       bank_match_status = 'confirmed',
       import_batch_id = <batchId>,                    -- da bude vidljiv u "Izvod" dijalogu
       merchant_name = COALESCE(merchant_name, imported.merchant_name)
   WHERE id = <manualId> AND bank_transaction_id IS NULL
   ```
   - `Promise.allSettled` za bulk.
   - **Bez** balance update-a (manual je već utjecao).
4. `unmatched` + `ambiguous` → postojeći `upsert(..., ignoreDuplicates: true)`. Balance update samo za stvarno umetnute (postojeća logika).
5. Vrati `{inserted, merged, skipped}`.

**UI poruka** — koristi postojeći `showSuccess`:
- `t('transactions.import.summaryFull', { inserted, merged, skipped })` = "Uvezeno X novih, spojeno Y s ručnim unosima, Z već postoji" (+ EN/DE).

## B) Vizualna oznaka u "Izvod" dijalogu

`src/components/ImportBatchDialog.tsx`:
- Mergeani red (`bank_match_status === 'confirmed'`) dobiva **mali badge** uz iznos: zelena `Link2` ili `CheckCircle2` ikona + tekst `t('importBatch.mergedWithManual')` = "Spojeno s ručnim unosom".
- Sortiraj normalno; ne pravi posebnu sekciju.

Globalna lista (`TransactionItem.tsx`) — već postoji `CheckCircle2` ikona za `confirmed`, ništa novo.

## C) Brisanje izvoda — UNMERGE umjesto delete za mergeane

**Novi RPC** (migracija) `unmerge_import_row(p_id uuid)` SECURITY DEFINER:
- Provjeri `auth.uid() = expenses.user_id`.
- `UPDATE expenses SET bank_transaction_id = NULL, bank_match_status = 'manual', import_batch_id = NULL WHERE id = p_id AND bank_match_status = 'confirmed' AND user_id = auth.uid()`.
- Bez balance promjene.

**Patch** `src/components/TransactionListDialog.tsx` `handleDeleteBatch` (linije 97-103) i `PaymentSourceTransactionsDialog.tsx` (isti pattern):
- Za svaki id u batchu pročitaj `bank_match_status` iz `filteredExpenses`.
- `confirmed` → RPC `unmerge_import_row(id)` (ne `onDelete`, balans ostaje).
- `bank_only` (ili bilo što drugo) → postojeći `onDelete(id)` (briše + vraća balans).
- `Promise.allSettled`, partial fail → `t('transactions.bulkDeleteFailed/bulkDeletePartial')`.

**Confirm dialog tekst** (`ImportBatchDialog.tsx` AlertDialog):
- Ako batch sadrži ≥1 `confirmed` red, prošireni opis:
  `t('importBatch.deleteDescWithMerged', { count, mergedCount })` = "Briše X redaka. Y redaka koji su spojeni s ručnim unosima neće biti obrisani — vratit će se u prvotno stanje."

## D) Što NE diramo
- Local mode (IndexedDB) — nepromijenjeno.
- `bank-sync-transactions` edge — vlastita logika.
- `duplicateDetection.ts`, `useRecurringMatcher`, `transferMatching` — nepromijenjeni.
- `getInitialBankMatchStatus`, `TransactionItem` confirmed ikona — već rade.
- DB šema za expenses kolone — sve već postoji. Samo dodajemo 1 RPC funkciju.

## E) Datoteke (sažeto)

**Nove:**
- `src/lib/manualMatchForImport.ts`
- `src/lib/manualMatchForImport.test.ts`
- Migracija: RPC `unmerge_import_row`

**Izmjene:**
- `src/hooks/useExpenseCRUD.ts` (cloud grana `importFromCSV`)
- `src/components/ImportBatchDialog.tsx` (badge + prošireni delete confirm)
- `src/components/TransactionListDialog.tsx` (handleDeleteBatch split)
- `src/components/PaymentSourceTransactionsDialog.tsx` (handleDeleteBatch split)
- `src/components/business/BusinessTransactions.tsx` (ako ima handleDeleteBatch — provjeriti)
- i18n: `hr.json` / `en.json` / `de.json` → `transactions.import.summaryFull`, `importBatch.mergedWithManual`, `importBatch.deleteDescWithMerged`

**Memory:**
- `mem://features/import-manual-merge` (nova) — ±1d, single-match-only, `import_batch_id` na mergeani, unmerge RPC pri brisanju batcha.
- Update `mem://index.md` u "Memories".

## F) Rizici
- **Race condition** (paralelni uvoz) → `WHERE bank_transaction_id IS NULL` guard.
- **Ambiguous (2 manual ista iznosa unutar 48h na istom izvoru)** → svjesno ne spajamo, ide kao novi (`bank_only`), korisnik može ručno.
- **Performance ≥500 redaka** → jedan range SELECT za cijeli batch.
- **Unmerge na isti mergeani red dvaput** → RPC ima `WHERE bank_match_status = 'confirmed'`, drugi poziv je no-op.
