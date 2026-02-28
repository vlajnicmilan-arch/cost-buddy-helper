

## Problem Analysis

The import flow has issues:
1. The `importFromCSV` in `useExpenseCRUD.ts` does a bulk insert without any duplicate checking — if duplicates exist, it either errors out or creates duplicates silently.
2. The `CSVImportDialog` has basic duplicate detection (same amount + same date) but it's too simple and doesn't use the fuzzy merchant matching from `useExpenses`.
3. The `PaymentSourceTransactionsDialog` has duplicate checking for PDF imports via `findDuplicates`, but the CSV import path doesn't pass `findDuplicates` properly — it relies on the simpler `isDuplicate` in `CSVImportDialog`.

## Plan

### 1. Enhance `CSVImportDialog` duplicate detection
- Pass `findDuplicates` from `useExpenses` into `CSVImportDialog` as an optional prop
- Use the fuzzy merchant matching logic (already in `useExpenses.findDuplicates`) instead of the simple amount+date check
- When duplicates are found, show them clearly marked with a yellow "Duplikat" badge and auto-deselect them
- Add a summary banner: "X potencijalnih duplikata pronađeno — automatski preskočeni"

### 2. Add duplicate pre-check to `importFromCSV` in `useExpenseCRUD.ts`
- Before inserting, wrap in try/catch with better error messages
- Add graceful handling so individual transaction failures don't abort the entire batch

### 3. Wire `findDuplicates` through all import entry points
- `Index.tsx` → `CSVImportDialog` (already has `findDuplicates` available)
- `Wallet.tsx` → `CSVImportDialog` via `PaymentSourceTransactionsDialog`
- `BankConnection.tsx` → `CSVImportDialog`

### 4. Add "Skip All Duplicates" / "Include Duplicates" toggle
- In the CSV preview step, add a toggle button to show/hide duplicates
- Add a "Select only new" button that deselects all flagged duplicates

### Technical Details
- Modify `CSVImportDialog` props to accept `findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; unique: ParsedTransaction[] }`
- Use this for more accurate detection when available, fall back to simple check otherwise
- In `useExpenseCRUD.importFromCSV`, add batch error handling: insert transactions one-by-one on bulk failure
- Pass `findDuplicates` from all call sites (`Index.tsx`, `Wallet.tsx`, `BankConnection.tsx`)

