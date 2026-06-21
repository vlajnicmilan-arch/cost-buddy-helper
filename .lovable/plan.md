## Status

**Već napravljeno (uz tvoje odobrenje):**
- Migracija: dodana kolona `expenses.recurring_transaction_id` + jedinstveni indeks `(user_id, recurring_transaction_id, date)` koji garantira idempotenciju na DB razini.
- Soft-delete 3 Vinkina duplikata (kasniji od para u svakom slučaju). U Smeću su, može ih vratiti.

## Preostaje (zahtijeva build mode da krenem s kodom)

### 1. `src/types/expense.ts`
Dodati polje `recurring_transaction_id?: string | null` u `Expense` interface.

### 2. `src/hooks/useExpenseCRUD.ts` — `addExpense`
Proslijediti `recurring_transaction_id` u insert payload (line ~244–267). Uhvatiti error code `23505` na uniq indexu i tretirati ga kao "već generirano" (no-op, bez throw, bez toast greške).

### 3. `src/hooks/useRecurringTransactions.ts` — `processDueTransactions`
Promijeniti redoslijed iz "insert → update next_due_date" u **claim-first**:
```
const { data: claimed } = await supabase
  .from('recurring_transactions')
  .update({ next_due_date: nextDate, last_generated_date: today })
  .eq('id', recurring.id)
  .eq('next_due_date', recurring.next_due_date) // compare-and-swap
  .select('id');
if (!claimed || claimed.length === 0) continue; // netko drugi je claim-ao
await addExpense({ ..., recurring_transaction_id: recurring.id }, ...);
```
Dodati i `useRef` lock unutar hooka tako da paralelni pozivi iz StrictMode / remount-a samo prvi prolaze (drugi rano izlazi). Lock je suvišan uz claim+uniq, ali smanjuje nepotreban network traffic.

### 4. Vitest test
`src/hooks/__tests__/processDueTransactions.test.ts` — mock supabase, pozvati 2× paralelno, expect-ati točno 1 addExpense poziv po pravilu.

### 5. Bez dodatnih promjena
Bez UI promjena, bez i18n promjena, bez novih guarda/timeoutova.

---

Za nastavak (kod): prebaci u build mode. Migration + brisanje duplikata su gotovi neovisno.