## Cilj

Dopustiti korisniku da **post-facto** spoji dvije postojeće transakcije — jednu ručno unesenu i jednu iz banke/izvoda — koje auto-merge tijekom uvoza nije ulovio.

Spajanje znači: ručni redak preuzme `bank_transaction_id` / `bank_account_id` / `import_batch_id` od bank retka, dobije `bank_match_status='confirmed'`, a bank redak se soft-deletea (uz revert salda).

## Faza 1 — Bulk gumb (radi se sad)

### 1.1 Pure helper `src/lib/manualBankMergePair.ts`

- `isMergeablePair(a, b): { ok: true; manual; bank } | { ok: false; reason: string }`
- Pravila:
  - isti `user_id`, `type`, `payment_source`, **`currency`** (eksplicitno)
  - jedan ima `bank_transaction_id` (bank), drugi nema (manual)
  - oba `deleted_at IS NULL`
  - manual nije već `confirmed`
  - iznos: `|Δ| / max <= 0.001`
  - datum: **`|Δ| <= 3 dana`**
  - obje **nisu** `expense_nature IN ('correction','transfer')`
  - nijedan nije `is_advance` i nema `linked_advance_ids`
- `reason` = i18n key (npr. `transactions.merge.errors.differentAmount`)
- Vitest: 10+ testova (happy + svaki fail razlog)

### 1.2 RPC `merge_manual_with_bank(p_manual_id, p_bank_id)`

Migracija. `SECURITY DEFINER`, `search_path=public`. Atomarno:

1. Učitaj oba retka, provjeri `auth.uid()` vlasništvo i `deleted_at IS NULL`
2. Server-side re-verifikacija svih pravila iz helpera (defense in depth)
3. Revert salda za bank redak: ako `payment_source` počinje s `custom:` i nije transfer/correction, pozovi inverse update na `custom_payment_sources.balance` (income → oduzmi, expense → dodaj)
4. `UPDATE expenses SET bank_transaction_id, bank_account_id, import_batch_id, bank_match_status='confirmed' WHERE id = p_manual_id`
5. `UPDATE expenses SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_bank_id`
6. Return `jsonb {ok, merged_into}`

Sve unutar jedne transakcije; ako bilo koji korak fail-a, rollback.

### 1.3 Hook `src/hooks/useManualBankMerge.ts`

- `mergePair(manualId, bankId)` → poziva RPC, invalidira `['expenses']`, `['paymentSources']`, `['balances']`, emitira `funnel_event: 'manual_merge_used'`
- `canMergeSelection(selected: Expense[])` → wrapper oko `isMergeablePair`

### 1.4 UI u `BulkActionsToolbar`

- Nove prop: `onBulkMerge?`, `selectedExpenses?: Expense[]`, `showMerge?: boolean`
- Gumb `Link2 "Spoji"`:
  - Vidljiv samo kad `showMerge && selectedCount === 2`
  - `disabled` ako `canMergeSelection` vrati `ok: false`; razlog u tooltipu (lokaliziran)
  - Klik → `AlertDialog` "Spoji ovu ručnu s ovom iz banke?" → potvrda → RPC → `StatusFeedback` "Spojeno"

### 1.5 Konzumenti

Proslijedi `onBulkMerge` + `selectedExpenses` (filter `expenses` po `selectedIds`) u:
- `TransactionListDialog.tsx`
- `PaymentSourceTransactionsDialog.tsx`
- `CategoryTransactionsDialog.tsx`
- `home/TransactionListSection.tsx`

### 1.6 i18n (hr/en/de)

Novi blok `transactions.merge.*`:
- `button`, `confirmTitle`, `confirmBody`, `success`, `errorGeneric`
- `errors.differentAmount`, `errors.differentSource`, `errors.differentCurrency`, `errors.differentType`, `errors.dateTooFar`, `errors.bothManual`, `errors.bothBank`, `errors.alreadyConfirmed`, `errors.correctionNature`, `errors.transferNature`, `errors.advanceProtected`, `errors.notTwoSelected`

## Faza 2 — Proaktivni badge (ODGOĐENO)

NE radi se sad. Trigger: telemetrija pokaže ≥5% korisnika koristi Fazu 1 u 30 dana, ILI dođe prava banka pa bude realnih ne-spojenih parova.

Skica:
- Klijentski memo: `findUnmatchedPairs` nad zadnjih 90d manual + bank_only
- Mali `Link2` badge u `TransactionRow` → mini-sheet "Spoji s ovom iz banke?" (Da / Ne / Nikad)
- Tablica `merge_dismissals (user_id, manual_id, bank_id)` za "Nikad"

## Što se NE radi

- Spajanje 2 ručna (= brisanje duplikata — postoji bulk delete + UNDO)
- Spajanje 2 bank retka (UNIQUE constraint sprječava)
- Auto-merge bez potvrde

## File list

**Novo:**
- `src/lib/manualBankMergePair.ts` + `src/lib/__tests__/manualBankMergePair.test.ts`
- `src/hooks/useManualBankMerge.ts`
- `supabase/migrations/<ts>_merge_manual_with_bank.sql`

**Izmijenjeno:**
- `src/components/BulkActionsToolbar.tsx`
- `src/components/TransactionListDialog.tsx`
- `src/components/PaymentSourceTransactionsDialog.tsx`
- `src/components/CategoryTransactionsDialog.tsx`
- `src/components/home/TransactionListSection.tsx`
- `src/i18n/locales/hr.json` / `en.json` / `de.json`
- `src/lib/funnelEvents.ts` (event `manual_merge_used` ako je union tipiziran)

**Nakon implementacije:** dodaj `mem://features/manual-bank-merge` u index.

## Parametri (potvrđeni)

- Currency: eksplicitna jednakost ✅
- Transfer nature: isključen ✅
- Datum tolerancija: **3 dana** ✅
- Iznos tolerancija: 0.1%
