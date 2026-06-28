import { useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, ReceiptItem, TransactionType } from '@/types/expense';
import { useAuth } from './useAuth';
import { useBalanceUpdater } from './useBalanceUpdater';
import { useBudgetAlerts } from './useBudgetAlerts';
import { useAppState } from '@/contexts/AppStateContext';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { ParsedTransaction } from '@/lib/csvParsers';
import { useTranslation } from 'react-i18next';
import { LocalFileCache } from './useLocalFileCache';
import { LocalStorage } from './useLocalStorage';
import {
  saveLocalExpense,
  updateLocalExpense,
  deleteLocalExpense,
  saveLocalReceiptItems,
  getLocalExpenses,
} from '@/lib/storage/indexedDB';
import { createOwnerLoanIfCrossMode, syncOwnerLoanForExpense, deleteOwnerLoanForExpense } from '@/lib/ownerLoanLogic';
import { invokeNotifyFunction } from '@/lib/notifyHelper';
import {
  normalizePaymentSource,
  tryNormalizePaymentSource,
  PaymentSourceNormalizeError,
  type NormalizeContext,
} from '@/lib/paymentSource/normalize';
import { normalizeExpensePayload, type WriterIntent } from '@/lib/balance/writerIntent';

interface UseExpenseCRUDOptions {
  isLocalMode: boolean;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  onBalanceUpdated?: () => void;
  /**
   * UUID-ovi custom payment source-a koje korisnik smije referencirati
   * (vlastiti + shared via payment_source_members).
   * Foundation Plan, Val 1: koristi se za normalizaciju payment_source
   * prije svakog write-a u `expenses`.
   */
  knownCustomSourceIds?: ReadonlySet<string>;
}

// Object-payload form za addExpense — sprječava regresiju gdje wrapper
// "izgubi" pozicijski `items` argument (root cause buga 21.03.–28.05.2026).
type AddExpensePayload = {
  expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
  items?: ReceiptItem[];
  isPendingMemberTransaction?: boolean;
  entrySource?: import('@/lib/bankMatchStatus').ExpenseEntrySource;
};
function isAddExpensePayload(x: unknown): x is AddExpensePayload {
  return !!x && typeof x === 'object' && 'expense' in (x as Record<string, unknown>);
}

export const useExpenseCRUD = ({
  isLocalMode,
  expenses,
  setExpenses,
  onBalanceUpdated,
  knownCustomSourceIds,
}: UseExpenseCRUDOptions) => {
  const { t } = useTranslation();
  const { user, authReady } = useAuth();
  const { updateBalance, handleTransactionUpdate } = useBalanceUpdater({ onBalanceUpdated });
  const { checkBudgetAlerts } = useBudgetAlerts();
  const { emitAvatarEvent, activeBusinessProfileId } = useAppState();

  // Single chokepoint za payment_source normalizaciju (Foundation Plan, Val 1).
  // Svaki .from('expenses').(insert|update|upsert) write u ovom hooku MORA
  // koristiti `normalizePs` neposredno prije writea.
  const normalizeCtx = useMemo<NormalizeContext>(() => ({
    knownCustomSourceIds: knownCustomSourceIds ?? new Set<string>(),
  }), [knownCustomSourceIds]);

  /**
   * Normalize for writers. Vraća canonical (built-in slug ili `custom:UUID`).
   * Na grešku loga diagnostic, prikazuje user-facing toast i throwa — caller
   * mora abort-ati save. NE silent-fall-back-amo na 'cash' jer bi to
   * zatrlo izvor s krivim balansom.
   */
  const normalizePs = useCallback((
    value: string | null | undefined,
    fallback: 'cash' | 'other',
    site: string,
  ): string => {
    const raw = (value == null || String(value).trim() === '') ? fallback : value;
    try {
      return normalizePaymentSource(raw, normalizeCtx);
    } catch (e) {
      const reason = e instanceof PaymentSourceNormalizeError ? e.reason : 'unknown';
      console.error('[ExpenseCRUD] payment_source normalize failed', { site, raw, reason });
      // Best-effort diagnostic log; never block insert with telemetry failure.
      if (user) {
        supabase.from('app_diagnostics_logs').insert([{
          session_id: 'expense-crud',
          event: 'payment_source_normalize_failed',
          route: typeof window !== 'undefined' ? window.location.pathname : null,
          user_id: user.id,
          app_version: (import.meta as any).env?.VITE_APP_VERSION ?? 'unknown',
          device_info: {},
          severity: 'error',
          details: { site, raw_preview: String(raw).slice(0, 80), reason },
        }]).then(() => {}, () => {});
      }
      throw e;
    }
  }, [normalizeCtx, user]);

  // Object-payload overload je definiran na module-scope-u (vidi AddExpensePayload).
  const addExpense = useCallback(async (
    expenseOrPayload:
      | Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>
      | AddExpensePayload,
    itemsArg?: ReceiptItem[],
    isPendingMemberTransactionArg?: boolean,
    entrySourceArg?: import('@/lib/bankMatchStatus').ExpenseEntrySource,
  ) => {
    const expense = isAddExpensePayload(expenseOrPayload) ? expenseOrPayload.expense : expenseOrPayload;
    const items = isAddExpensePayload(expenseOrPayload) ? expenseOrPayload.items : itemsArg;
    const isPendingMemberTransaction = isAddExpensePayload(expenseOrPayload)
      ? expenseOrPayload.isPendingMemberTransaction
      : isPendingMemberTransactionArg;
    const entrySource = isAddExpensePayload(expenseOrPayload) ? expenseOrPayload.entrySource : entrySourceArg;
    const normalizedDescription = (expense.description ?? '').trim()
      || expense.merchant_name?.trim()
      || (expense.type === 'transfer' ? 'Prijenos' : expense.type === 'income' ? 'Prihod' : 'Trošak');

    const normalizedExpense = {
      ...expense,
      description: normalizedDescription,
      // Force system-reserved category for transfers
      category: expense.type === 'transfer' ? ('transfer' as any) : expense.category,
    };

    try {
      if (isLocalMode) {
        const newExpense = await saveLocalExpense(normalizedExpense);
        if (items && items.length > 0) await saveLocalReceiptItems(newExpense.id, items);
        setExpenses(prev => [newExpense, ...prev]);
        await updateBalance(normalizedExpense.payment_source, normalizedExpense.amount, normalizedExpense.type);
        if (normalizedExpense.type === 'transfer' && normalizedExpense.income_source_id) {
          await updateBalance(normalizedExpense.income_source_id, normalizedExpense.amount, 'income');
        }
        if (normalizedExpense.type === 'income') {
          emitAvatarEvent('happy', 'Super! Novi prihod zabilježen! 💰');
        } else if (normalizedExpense.type === 'expense') {
          emitAvatarEvent('neutral', 'Zapisano! 📝');
        }
        showSuccess(normalizedExpense.type === 'income' ? t('feedback.incomeAdded') : t('feedback.expenseAdded'));
      } else {
        if (!authReady) { console.warn('[ExpenseCRUD] auth not ready yet, ignoring save'); return; }
        if (!user) { showError(t('feedback.mustBeLoggedIn')); return; }

        // Diagnostic trail BEFORE insert — captures whether project_id was passed in
        // (helps debug "transaction saved without project" reports). Best-effort.
        try {
          await supabase.from('app_diagnostics_logs').insert([{
            session_id: 'expense-crud',
            event: 'expense_insert_attempt',
            route: typeof window !== 'undefined' ? window.location.pathname : null,
            user_id: user.id,
            app_version: (import.meta as any).env?.VITE_APP_VERSION ?? 'unknown',
            device_info: {
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            },
            details: {
              has_project_id: !!normalizedExpense.project_id,
              project_id: normalizedExpense.project_id ?? null,
              has_income_source: !!normalizedExpense.income_source_id,
              income_source_id: normalizedExpense.income_source_id ?? null,
              has_budget_id: !!normalizedExpense.budget_id,
              type: normalizedExpense.type,
              amount: normalizedExpense.amount,
              description_preview: (normalizedExpense.description || '').slice(0, 60),
              is_pending: !!isPendingMemberTransaction,
            },
          }]);
        } catch {
          // Best-effort: never block insert because of diagnostics.
        }

        // Regresijska zaštita: AI scan MORA proslijediti items.
        // Ako items fale, najvjerojatnije je riječ o wrapperu koji je "izgubio"
        // pozicijski argument (bug 21.03.–28.05.2026). Ne blokira insert
        // (user možda namjerno obriše stavke), ali ostavlja glasan trag.
        try {
          const { shouldWarnMissingItems } = await import('@/lib/receiptItemsGuard');
          if (shouldWarnMissingItems({ aiExtracted: normalizedExpense.ai_extracted, items })) {
            console.warn(
              '[ExpenseCRUD] ai_extracted=true bez items — sumnja na regresiju write-patha',
              { merchant: normalizedExpense.merchant_name, route: typeof window !== 'undefined' ? window.location.pathname : null },
            );
            try {
              await supabase.from('app_diagnostics_logs').insert([{
                session_id: 'expense-crud',
                event: 'receipt_items_missing_on_ai_scan',
                route: typeof window !== 'undefined' ? window.location.pathname : null,
                user_id: user.id,
                app_version: (import.meta as any).env?.VITE_APP_VERSION ?? 'unknown',
                device_info: {},
                severity: 'warning',
                details: {
                  merchant: normalizedExpense.merchant_name ?? null,
                  amount: normalizedExpense.amount,
                  description_preview: (normalizedExpense.description || '').slice(0, 60),
                },
              }]);
            } catch { /* best-effort */ }
          }
        } catch { /* helper import never blocks insert */ }


        // Hybrid bank-first: odredi početni bank_match_status.
        // - OCR/slikani račun (ai_extracted=true) → 'ocr' source
        // - Sve ostalo (ručni unos) → 'manual' source
        // Helper sam odlučuje pending_bank vs manual ovisno o tome je li
        // payment_source spojen na bank konekciju.
        const { getInitialBankMatchStatus } = await import('@/lib/bankMatchStatus');
        const { getBankLinkedSourceIds } = await import('@/lib/bankLinkedSources');
        const bankLinkedSourceIds = await getBankLinkedSourceIds(
          user.id,
          (normalizedExpense as any).business_profile_id || activeBusinessProfileId || null,
        );

        // Foundation Plan Val 1: normalize payment_source to canonical form
        // (built-in slug or `custom:UUID`) before insert. Throws if unknown UUID.
        let canonicalPaymentSource: string;
        try {
          canonicalPaymentSource = normalizePs(normalizedExpense.payment_source, 'cash', 'addExpense.insert');
        } catch {
          showError(t('feedback.unknownPaymentSource', 'Nepoznat izvor plaćanja. Osvježi i pokušaj ponovno.'));
          throw new Error('payment_source normalize failed');
        }

        const bankMatchStatus = getInitialBankMatchStatus({
          source: entrySource ?? (normalizedExpense.ai_extracted ? 'ocr' : 'manual'),
          paymentSource: canonicalPaymentSource,
          bankLinkedSourceIds,
        });

        // Val 2: foundation gate. Default intent strips precision fields,
        // letting the Val 1 trigger derive event_at from `date` as C3.
        const insertPayload = normalizeExpensePayload({
          user_id: user.id,
          amount: normalizedExpense.amount,
          description: normalizedExpense.description,
          category: normalizedExpense.category,
          type: normalizedExpense.type,
          date: normalizedExpense.date.toISOString(),
          payment_source: canonicalPaymentSource,
          payment_source_card_id: normalizedExpense.payment_source_card_id || null,
          receipt_url: normalizedExpense.receipt_url,
          merchant_name: normalizedExpense.merchant_name,
          ai_extracted: normalizedExpense.ai_extracted,
          income_source_id: normalizedExpense.income_source_id,
          project_id: normalizedExpense.project_id || null,
          budget_id: normalizedExpense.budget_id || null,
          note: normalizedExpense.note || null,
          expense_nature: normalizedExpense.expense_nature || null,
          status: isPendingMemberTransaction ? 'pending' : 'approved',
          submitted_by: isPendingMemberTransaction ? user.id : null,
          business_profile_id: (normalizedExpense as any).business_profile_id || activeBusinessProfileId || null,
          currency: (normalizedExpense as any).currency || null,
          bank_match_status: bankMatchStatus,
          recurring_transaction_id: (normalizedExpense as any).recurring_transaction_id || null,
        }, 'default');

        const { data, error } = await supabase
          .from('expenses')
          .insert(insertPayload as any)
          .select()
          .single();

        if (error) {
          // Idempotency: uniq_recurring_per_day (recurring auto-gen). Drugi paralelni
          // pokušaj za isti dan/pravilo je odbijen na DB razini — tretiraj kao no-op.
          if (error.code === '23505' && (normalizedExpense as any).recurring_transaction_id) {
            console.log('[ExpenseCRUD] recurring already generated for this day, skipping', {
              recurring_transaction_id: (normalizedExpense as any).recurring_transaction_id,
              date: normalizedExpense.date,
            });
            return;
          }
          console.error('Supabase insert error details:', { error, code: error.code, message: error.message, details: error.details });
          throw error;
        }
        console.log('✅ Expense saved to DB:', data?.id, 'project_id:', data?.project_id ?? 'NULL');

        // Funnel: log first_transaction (idempotent — DB unique index dedups).
        import('@/lib/funnelTracking')
          .then(({ logFunnelEvent }) => logFunnelEvent('first_transaction', {
            type: normalizedExpense.type,
            has_project: !!normalizedExpense.project_id,
            has_budget: !!normalizedExpense.budget_id,
          }))
          .catch(() => {});

        if (items && items.length > 0 && data) {
          const { error: itemsError } = await supabase.from('receipt_items').insert(items.map(item => ({
            expense_id: data.id,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || null,
            total_price: item.total_price
          })));
          // Diagnostic trail so future silent failures are visible.
          try {
            await supabase.from('app_diagnostics_logs').insert([{
              session_id: 'expense-crud',
              event: itemsError ? 'receipt_items_insert_error' : 'receipt_items_insert_success',
              route: typeof window !== 'undefined' ? window.location.pathname : null,
              user_id: user.id,
              app_version: (import.meta as any).env?.VITE_APP_VERSION ?? 'unknown',
              device_info: {},
              severity: itemsError ? 'error' : 'info',
              details: {
                expense_id: data.id,
                items_received: items.length,
                error_code: itemsError?.code ?? null,
                error_message: itemsError?.message ?? null,
              },
            }]);
          } catch { /* best-effort */ }
          if (itemsError) {
            console.error('[ExpenseCRUD] receipt_items insert failed:', itemsError);
            // Re-throw so UI shows error instead of silent "success" without artikli.
            throw itemsError;
          }
        }

        // Owner-loan auto-creation: business expense paid from a personal source.
        // Awaited so the debt entry exists before the UI refetches & closes the dialog —
        // otherwise the company view appears empty even though the expense was saved.
        const expenseBpId = (normalizedExpense as any).business_profile_id || activeBusinessProfileId || null;
        if (expenseBpId && data && !isPendingMemberTransaction) {
          try {
            await createOwnerLoanIfCrossMode({
              expenseId: data.id,
              userId: user.id,
              businessProfileId: expenseBpId,
              paymentSource: canonicalPaymentSource,
              amount: normalizedExpense.amount,
              description: normalizedExpense.description,
            });
          } catch (e) {
            console.error('Owner-loan creation failed:', e);
          }
        }

        // Notifications (fire-and-forget, don't block) — uses notifyHelper for reliable delivery + diagnostic trail
        if (isPendingMemberTransaction && normalizedExpense.income_source_id && data) {
          invokeNotifyFunction({
            functionName: 'notify-pending-transaction',
            body: { expense_id: data.id, income_source_id: normalizedExpense.income_source_id },
          });
        }
        if (normalizedExpense.project_id && data) {
          invokeNotifyFunction({
            functionName: 'notify-project-transaction',
            body: { expense_id: data.id, project_id: normalizedExpense.project_id, action: 'created' },
          });
        }
        if (normalizedExpense.note && normalizedExpense.income_source_id && data) {
          invokeNotifyFunction({
            functionName: 'notify-note-added',
            body: { expense_id: data.id, income_source_id: normalizedExpense.income_source_id, note: normalizedExpense.note },
          });
        }

        const newExpense: Expense = {
          ...data,
          date: new Date(data.date),
          category: data.category as Category,
          type: data.type as TransactionType,
          payment_source: (data.payment_source || 'cash') as PaymentSource,
          income_source_id: data.income_source_id,
          payment_source_card_id: data.payment_source_card_id,
          expense_nature: (data.expense_nature as 'regular' | 'extraordinary') || undefined
        };

        // Optimistic prepend + sort by date desc kako bi `allExpenses[0]`
        // odmah odražavao najnoviju transakciju (Bug 2: guided "last entry"
        // kartica). Realtime grana već radi isto sortiranje.
        setExpenses(prev => {
          const next = [newExpense, ...prev];
          next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return next;
        });

        const savedIncomeSourceId = data.income_source_id || normalizedExpense.income_source_id;
        await updateBalance(canonicalPaymentSource, normalizedExpense.amount, normalizedExpense.type);
        if (normalizedExpense.type === 'transfer' && savedIncomeSourceId) {
          await updateBalance(savedIncomeSourceId, normalizedExpense.amount, 'income').catch(e =>
            console.error('Destination balance update failed:', e)
          );
        }
        if (normalizedExpense.type === 'expense') {
          checkBudgetAlerts(normalizedExpense.category, normalizedExpense.amount, normalizedExpense.date);
          emitAvatarEvent('neutral', 'Zapisano! 📝');
        }
        if (normalizedExpense.type === 'income') emitAvatarEvent('happy', 'Super! Novi prihod zabilježen! 💰');

        if (isPendingMemberTransaction) {
          showSuccess(t('feedback.pendingSent'));
        } else {
          showSuccess(normalizedExpense.type === 'income' ? t('feedback.incomeAdded') : t('feedback.expenseAdded'));
        }
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('description')) {
        showError(t('feedback.missingDescription'));
      } else {
        showError(t('toasts.premiseAddError'));
      }
      throw error; // Re-throw so callers know the operation failed
    }
  }, [isLocalMode, user, setExpenses, updateBalance, emitAvatarEvent, checkBudgetAlerts, activeBusinessProfileId, normalizePs]);

  const updateExpense = useCallback(async (expense: Expense) => {
    try {
      let oldExpense = expenses.find(e => e.id === expense.id);

      if (isLocalMode) {
        const updated = await updateLocalExpense(expense);
        setExpenses(prev => prev.map(e => e.id === expense.id ? updated : e));
        if (oldExpense) {
          await handleTransactionUpdate(
            oldExpense.payment_source, oldExpense.amount, oldExpense.type,
            expense.payment_source, expense.amount, expense.type,
            oldExpense.income_source_id, expense.income_source_id
          );
          onBalanceUpdated?.();
        }
        showSuccess(t('feedback.updated'));
      } else {
        if (!authReady) { console.warn('[ExpenseCRUD] auth not ready yet, ignoring save'); return; }
        if (!user) { showError(t('feedback.mustBeLoggedIn')); return; }

        if (!oldExpense) {
          const { data: dbOldExpense } = await supabase
            .from('expenses').select('*').eq('id', expense.id).maybeSingle();
          if (dbOldExpense) oldExpense = dbOldExpense as unknown as Expense;
        }

        // Foundation Plan Val 1: normalize before update.
        let canonicalPaymentSource: string;
        try {
          canonicalPaymentSource = normalizePs(expense.payment_source, 'cash', 'updateExpense.update');
        } catch {
          showError(t('feedback.unknownPaymentSource', 'Nepoznat izvor plaćanja. Osvježi i pokušaj ponovno.'));
          return;
        }

        const { error } = await supabase
          .from('expenses')
          .update({
            amount: expense.amount,
            description: expense.description,
            // Force system-reserved category for transfers
            category: expense.type === 'transfer' ? 'transfer' : expense.category,
            type: expense.type,
            date: expense.date instanceof Date ? expense.date.toISOString() : expense.date,
            payment_source: canonicalPaymentSource,
            payment_source_card_id: expense.payment_source_card_id || null,
            merchant_name: expense.merchant_name,
            income_source_id: expense.income_source_id,
            project_id: expense.project_id || null,
            budget_id: expense.budget_id || null,
            expense_nature: expense.expense_nature || null,
            note: expense.note || null,
            
            currency: expense.currency || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', expense.id);

        if (error) throw error;

        // Reflect canonical value in local state + downstream balance/owner-loan calls.
        const canonicalExpense: Expense = { ...expense, payment_source: canonicalPaymentSource as PaymentSource };
        setExpenses(prev => prev.map(e => e.id === expense.id ? canonicalExpense : e));

        if (oldExpense) {
          await handleTransactionUpdate(
            oldExpense.payment_source, oldExpense.amount, oldExpense.type,
            canonicalPaymentSource, expense.amount, expense.type,
            oldExpense.income_source_id, expense.income_source_id
          );
          onBalanceUpdated?.();
        } else {
          console.warn('Could not find old expense for balance update:', expense.id);
        }

        // Notifications (fire-and-forget) — uses notifyHelper for reliable delivery + diagnostic trail
        const projectChanged = expense.project_id !== oldExpense?.project_id;
        const significantChange = expense.amount !== oldExpense?.amount ||
          expense.description !== oldExpense?.description || expense.type !== oldExpense?.type;
        if (expense.project_id && (projectChanged || significantChange)) {
          invokeNotifyFunction({
            functionName: 'notify-project-transaction',
            body: { expense_id: expense.id, project_id: expense.project_id, action: 'updated' },
          });
        }
        const noteWasAdded = expense.note && (!oldExpense?.note || oldExpense.note !== expense.note);
        if (noteWasAdded && expense.income_source_id) {
          invokeNotifyFunction({
            functionName: 'notify-note-added',
            body: { expense_id: expense.id, income_source_id: expense.income_source_id, note: expense.note },
          });
        }

        // Sync owner-loan when business expense edited
        const updatedBpId = (expense as any).business_profile_id || activeBusinessProfileId || null;
        if (updatedBpId && user) {
          syncOwnerLoanForExpense({
            expenseId: expense.id,
            userId: user.id,
            businessProfileId: updatedBpId,
            paymentSource: canonicalPaymentSource,
            amount: expense.amount,
            description: expense.description,
          }).catch(e => console.error('Owner-loan sync failed:', e));
        }

        showSuccess(t('feedback.updated'));
      }
    } catch (error) {
      console.error('Error updating expense:', error);
      showError(t('toasts.recategorizeError'));
    }
  }, [isLocalMode, user, expenses, setExpenses, handleTransactionUpdate, onBalanceUpdated, normalizePs, t, authReady, activeBusinessProfileId]);

  const bulkUpdateExpenses = useCallback(async (expensesToUpdate: Expense[]) => {
    try {
      if (isLocalMode) {
        await Promise.all(expensesToUpdate.map(expense => updateLocalExpense(expense)));
        setExpenses(prev => {
          const updatedMap = new Map(expensesToUpdate.map(e => [e.id, e]));
          return prev.map(e => updatedMap.get(e.id) || e);
        });
        showSuccess(t('feedback.bulkUpdated', { count: expensesToUpdate.length }));
      } else {
        if (!authReady) { console.warn('[ExpenseCRUD] auth not ready yet, ignoring save'); return; }
        if (!user) { showError(t('feedback.mustBeLoggedIn')); return; }

        // Foundation Plan Val 1: normalize each row before bulk update. Failed
        // normalizations are skipped (not silently 'cash'-faked) and logged.
        const normalizedRows = expensesToUpdate.map((expense) => {
          try {
            const canonical = normalizePs(expense.payment_source, 'cash', 'bulkUpdateExpenses.update');
            return { expense, canonical };
          } catch {
            return { expense, canonical: null as string | null };
          }
        });
        const skipped = normalizedRows.filter(r => r.canonical == null);
        if (skipped.length > 0) {
          showError(t('feedback.unknownPaymentSource', 'Nepoznat izvor plaćanja. Osvježi i pokušaj ponovno.'));
        }
        const toWrite = normalizedRows.filter(r => r.canonical != null) as Array<{ expense: Expense; canonical: string }>;

        await Promise.all(toWrite.map(async ({ expense, canonical }) => {
          const { error } = await supabase
            .from('expenses')
            .update({
              category: expense.category,
              payment_source: canonical,
              updated_at: new Date().toISOString()
            })
            .eq('id', expense.id);
          if (error) throw error;
        }));

        setExpenses(prev => {
          const updatedMap = new Map(toWrite.map(r => [r.expense.id, { ...r.expense, payment_source: r.canonical as PaymentSource }]));
          return prev.map(e => updatedMap.get(e.id) || e);
        });
      }
    } catch (error) {
      console.error('Error bulk updating expenses:', error);
      showError(t('feedback.bulkUpdateError'));
      throw error;
    }
  }, [isLocalMode, user, setExpenses, normalizePs, authReady, t]);

  const deleteExpense = useCallback(async (id: string, options?: { silent?: boolean }) => {
    try {
      // Look up from local state first; if not found (e.g. shared/member transaction), fetch from DB
      let expenseToDelete = expenses.find(e => e.id === id);

      if (!expenseToDelete && !isLocalMode && user) {
        const { data } = await supabase.from('expenses').select('*').eq('id', id).maybeSingle();
        if (data) expenseToDelete = data as unknown as Expense;
      }

      // Delete local receipt image if it exists
      if (expenseToDelete?.receipt_url?.startsWith('local:')) {
        const localPath = expenseToDelete.receipt_url.replace('local:', '');
        await LocalFileCache.deleteReceiptImage(localPath).catch(() => {});
        await LocalStorage.remove(localPath).catch(() => {});
      }

      if (isLocalMode) {
        await deleteLocalExpense(id);
      } else {
        // Delete linked owner-loan first (if any) — owner-loan se hard deleta
        deleteOwnerLoanForExpense(id).catch(e => console.error('Owner-loan delete failed:', e));
        // Soft delete (Koš za smeće) preko SECURITY DEFINER RPC —
        // direktan UPDATE pada jer `hide_soft_deleted` RESTRICTIVE SELECT policy
        // ne dopušta RETURNING red kojem je deleted_at != NULL.
        const { softDelete } = await import('@/lib/softDelete');
        await softDelete('expenses', id, user?.id ?? '');
      }

      setExpenses(prev => prev.filter(e => e.id !== id));

      if (expenseToDelete) {
        if (expenseToDelete.type === 'transfer') {
          await updateBalance(expenseToDelete.payment_source, expenseToDelete.amount, 'transfer', true);
          if (expenseToDelete.income_source_id) {
            await updateBalance(expenseToDelete.income_source_id, expenseToDelete.amount, 'income', true);
          }
        } else {
          await updateBalance(expenseToDelete.payment_source, expenseToDelete.amount, expenseToDelete.type, true);
        }
        onBalanceUpdated?.();
      } else {
        console.warn('[deleteExpense] Could not find expense to reverse balance for id:', id);
      }

      if (!options?.silent) {
        emitAvatarEvent('thinking', 'Uklonjeno... 🗑️');
        showSuccess(t('feedback.deleted'));
      }
    } catch (error) {
      console.error('Error deleting expense:', error);
      if (!options?.silent) {
        showError(t('toasts.cashRegisterDeleteError'));
      }
      throw error; // bulk wrapper mora znati da je pala
    }
  }, [isLocalMode, user, expenses, setExpenses, updateBalance, onBalanceUpdated, emitAvatarEvent, t]);

  const importFromCSV = useCallback(async (
    transactions: ParsedTransaction[],
    opts?: {
      forcedManualMerges?: Array<{ tx: ParsedTransaction; manualId: string }>;
      /**
       * Optional sink za pravu evidenciju izvoda — pozove se NAKON što su
       * redovi obrađeni s pravim `batchId` i brojevima. Ne mijenja
       * povratni tip funkcije, samo opcionalna telemetrija + statement record.
       */
      onMeta?: (meta: { batchId: string; inserted: number; merged: number; skipped: number }) => void;
    },
  ) => {
    const batchId = crypto.randomUUID();
    try {
      const forcedMerges = opts?.forcedManualMerges ?? [];

      if (isLocalMode) {
        for (const tx of transactions) {
          await saveLocalExpense({
            amount: tx.amount,
            description: tx.description,
            category: tx.category,
            type: tx.type,
            date: tx.date,
            payment_source: tx.payment_source || 'other',
            merchant_name: tx.merchant_name || null,
            ai_extracted: false,
            import_batch_id: batchId
          });
          const txType = tx.type as TransactionType;
          if (txType === 'transfer') {
            await updateBalance(tx.payment_source || 'other', tx.amount, 'transfer');
          } else {
            await updateBalance(tx.payment_source || 'other', tx.amount, txType);
          }
        }
        onBalanceUpdated?.();
        const updatedExpenses = await getLocalExpenses();
        setExpenses(updatedExpenses);
        showSuccess(`Uvezeno ${transactions.length} transakcija`);
      } else {
        if (!authReady) { console.warn('[ExpenseCRUD] auth not ready yet, ignoring save'); return; }
        if (!user) { showError(t('errors.mustBeLoggedIn', 'Moraš biti prijavljen')); return; }

        // Compute deterministic fingerprint for rows missing one. Backed by
        // unique index `uniq_expenses_user_bank_tx(user_id, bank_transaction_id)`
        // so re-importing the same statement cannot create duplicates.
        const { computeImportFingerprint } = await import('@/lib/importFingerprint');
        let fingerprinted = await Promise.all(transactions.map(async (tx) => {
          const fingerprint = tx.bank_transaction_id
            || await computeImportFingerprint({
              userId: user.id,
              paymentSource: tx.payment_source,
              date: tx.date,
              type: tx.type,
              amount: tx.amount,
              description: tx.description,
              merchantName: tx.merchant_name,
            });
          return { tx, fingerprint };
        }));

        // === Auto-merge: spoji izvod redove s postojećim ručnim unosima ===
        // Match scope: ±1 dan, isti payment_source, isti type, isti iznos.
        // Mergeani redovi ostaju isti DB redovi (zadržavaju saldo efekt),
        // dobivaju bank_transaction_id + bank_match_status='confirmed' + import_batch_id.
        let mergedCount = 0;
        const mergedFingerprints = new Set<string>();

        // === Forced manual merges (user chose "Spoji" in duplicate dialog) ===
        // Eksplicitne korisničke odluke iz UI-ja imaju prednost prije bilo
        // kakvog auto-merge-a i prije upserta. Manual red dobiva
        // bank_transaction_id + bank_match_status='confirmed' + import_batch_id;
        // pripadajući tx se izbacuje iz daljnje obrade.
        if (forcedMerges.length > 0) {
          const forcedTxRefs = new Set(forcedMerges.map(m => m.tx));
          const forcedResults = await Promise.allSettled(forcedMerges.map(async (m) => {
            const fp = fingerprinted.find(r => r.tx === m.tx);
            if (!fp) return false;
            const { error: updErr, data: updData } = await supabase
              .from('expenses')
              .update({
                bank_transaction_id: fp.fingerprint,
                bank_match_status: 'confirmed',
                import_batch_id: batchId,
                merchant_name: fp.tx.merchant_name || null,
              })
              .eq('id', m.manualId)
              .eq('user_id', user.id)
              .is('bank_transaction_id', null) // race-guard
              .select('id');
            if (updErr) {
              console.warn('[importFromCSV] forced merge failed:', updErr.message);
              return false;
            }
            if (updData && updData.length > 0) {
              mergedFingerprints.add(fp.fingerprint);
              return true;
            }
            return false;
          }));
          mergedCount += forcedResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
          // Forced merge txs preskaču i auto-merge query i upsert ispod.
          // Auto-merge dolje koristi `fingerprinted` direktno — filter ručno:
          for (let i = fingerprinted.length - 1; i >= 0; i -= 1) {
            if (forcedTxRefs.has(fingerprinted[i].tx)) {
              fingerprinted.splice(i, 1);
            }
          }
        }
        try {
          // Expand sources IN-list with BOTH canonical and raw-UUID variants so
          // we still find legacy rows pre-backfill (read-side tolerant reader).
          const rawSources = Array.from(new Set(fingerprinted
            .map(r => r.tx.payment_source || 'other')
            .filter(Boolean))) as string[];
          const sources = Array.from(new Set(rawSources.flatMap((s) => {
            const variants = new Set<string>([s]);
            if (s.startsWith('custom:')) variants.add(s.slice('custom:'.length));
            else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
              variants.add(`custom:${s}`);
            }
            return Array.from(variants);
          })));

          const dates = fingerprinted.map(r => r.tx.date.getTime());
          if (dates.length > 0 && sources.length > 0) {
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            const minIso = new Date(minDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const maxIso = new Date(maxDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

            const { data: manualRows, error: manualErr } = await supabase
              .from('expenses')
              .select('id, payment_source, type, amount, date, bank_match_status, bank_transaction_id')
              .eq('user_id', user.id)
              .in('payment_source', sources)
              .in('type', ['income', 'expense', 'transfer'])
              .in('bank_match_status', ['manual', 'pending_bank'])
              .is('bank_transaction_id', null)
              .is('deleted_at', null)
              .gte('date', minIso)
              .lte('date', maxIso);

            if (manualErr) {
              console.warn('[importFromCSV] manual candidate query failed, skipping auto-merge:', manualErr.message);
            } else if (manualRows && manualRows.length > 0) {
              const { matchManualToImported } = await import('@/lib/manualMatchForImport');
              const matchResult = matchManualToImported({
                imported: fingerprinted.map((r, idx) => ({
                  index: idx,
                  paymentSource: r.tx.payment_source || 'other',
                  type: r.tx.type,
                  amount: r.tx.amount,
                  date: r.tx.date,
                })),
                manualCandidates: manualRows.map(m => ({
                  id: m.id,
                  paymentSource: m.payment_source,
                  type: m.type,
                  amount: Number(m.amount),
                  date: m.date,
                })),
                maxDayDiff: 1,
              });

              const updates = await Promise.allSettled(matchResult.matches.map(async (m) => {
                const row = fingerprinted[m.importedIndex];
                const { error: updErr, data: updData } = await supabase
                  .from('expenses')
                  .update({
                    bank_transaction_id: row.fingerprint,
                    bank_match_status: 'confirmed',
                    import_batch_id: batchId,
                    merchant_name: row.tx.merchant_name || null,
                  })
                  .eq('id', m.manualId)
                  .eq('user_id', user.id)
                  .is('bank_transaction_id', null) // race-guard
                  .select('id');
                if (updErr) throw updErr;
                if (updData && updData.length > 0) {
                  mergedFingerprints.add(row.fingerprint);
                  return true;
                }
                return false;
              }));
              mergedCount = updates.filter(u => u.status === 'fulfilled' && u.value === true).length;
            }
          }
        } catch (mergeErr) {
          console.warn('[importFromCSV] auto-merge step failed, falling back to plain insert:', mergeErr);
        }

        // Redovi za upsert = svi osim onih koji su uspješno mergeani.
        // Foundation Plan Val 1: normalize payment_source per row. Failed
        // normalizations su skipped (logirano) — ne fake-amo 'cash'/'other'.
        const upsertCandidates = fingerprinted
          .filter(r => !mergedFingerprints.has(r.fingerprint))
          .map(({ tx, fingerprint }) => {
            const canonical = tryNormalizePaymentSource(tx.payment_source || 'other', normalizeCtx);
            return { tx, fingerprint, canonical };
          });
        const importSkipped = upsertCandidates.filter(r => r.canonical == null);
        if (importSkipped.length > 0) {
          console.warn('[importFromCSV] skipped rows with unknown payment_source:', importSkipped.length);
        }
        const rows = upsertCandidates
          .filter(r => r.canonical != null)
          .map(({ tx, fingerprint, canonical }) => ({
            user_id: user.id,
            amount: tx.amount,
            description: tx.description,
            category: tx.category,
            type: tx.type,
            date: tx.date.toISOString(),
            payment_source: canonical as string,
            merchant_name: tx.merchant_name || null,
            ai_extracted: false,
            import_batch_id: batchId,
            business_profile_id: activeBusinessProfileId || null,
            bank_transaction_id: fingerprint,
            // Hybrid bank-first: CSV/PDF uvoz JE bankovni izvod = potvrda novca,
            // pa redovi idu kao `bank_only`. Kasniji bank sync može upgrade-ati
            // u `confirmed` ako match-a po amount/date/payment_source.
            bank_match_status: 'bank_only',
          }));

        // Upsert with ignoreDuplicates: rows with a fingerprint that already
        // exists for this user are silently skipped. `.select()` returns only
        // newly inserted rows.
        let insertedData: any[] = [];
        if (rows.length > 0) {
          const { data, error } = await supabase
            .from('expenses')
            .upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true })
            .select();

          if (error) {
            console.error('Bulk upsert failed:', error.message);
            throw error;
          }
          insertedData = data || [];
        }

        const skippedCount = rows.length - insertedData.length;

        const newExpenses: Expense[] = insertedData.map(e => ({
          ...e,
          date: new Date(e.date),
          category: e.category as Category,
          type: e.type as TransactionType,
          payment_source: (e.payment_source || 'cash') as PaymentSource,
          expense_nature: (e.expense_nature as 'regular' | 'extraordinary') || undefined
        }));

        // === Installment linking ===
        // Za inserted retke koji nose `is_installment` meta (iz PDF-a), pokušaj
        // fuzzy match na postojeći `installment_plan` istog usera i označi
        // pripadajuću `installments` ratu kao paid + poveži s expense_id.
        let linkedInstallmentsCount = 0;
        try {
          const installmentRows = fingerprinted.filter(r => r.tx.is_installment === true);
          if (installmentRows.length > 0 && insertedData.length > 0) {
            // Map inserted rows by fingerprint za brzo dohvaćanje ID-a.
            const insertedByFp = new Map<string, string>();
            for (const e of insertedData) {
              if (e.bank_transaction_id) insertedByFp.set(e.bank_transaction_id, e.id);
            }

            const { data: plansData, error: plansErr } = await supabase
              .from('installment_plans')
              .select('id, description, total_amount, installment_count, type, installments(id, plan_id, installment_number, amount, status, expense_id)')
              .eq('user_id', user.id);

            if (plansErr) {
              console.warn('[importFromCSV] installment plans fetch failed:', plansErr.message);
            } else if (plansData && plansData.length > 0) {
              const { matchInstallmentToPlan } = await import('@/lib/installmentMatching');
              const plans = plansData.map((p: any) => ({
                id: p.id,
                description: p.description,
                total_amount: Number(p.total_amount),
                installment_count: p.installment_count,
                type: p.type,
                installments: (p.installments || []).map((i: any) => ({
                  id: i.id,
                  plan_id: i.plan_id,
                  installment_number: i.installment_number,
                  amount: Number(i.amount),
                  status: i.status,
                  expense_id: i.expense_id,
                })),
              }));

              // Pratimo koji su installmenti već zauzeti u ovom batchu da ne
              // dvostruko linkamo dvije rate na isti zapis.
              const usedInstallmentIds = new Set<string>();

              for (const r of installmentRows) {
                const expenseId = insertedByFp.get(r.fingerprint);
                if (!expenseId) continue; // već postojao (skipped duplicate) ili merged

                // Filtriraj već zauzete installmente live
                const livePlans = plans.map(p => ({
                  ...p,
                  installments: (p.installments || []).filter(i => !usedInstallmentIds.has(i.id)),
                }));

                const match = matchInstallmentToPlan({
                  base_description: r.tx.installment_base_description ?? null,
                  description: r.tx.description,
                  amount: r.tx.amount,
                  installment_current: r.tx.installment_current ?? null,
                  installment_total: r.tx.installment_total ?? null,
                  type: r.tx.type as 'expense' | 'income' | 'transfer',
                }, livePlans);

                if (!match) continue;

                const { error: updErr } = await supabase
                  .from('installments')
                  .update({
                    expense_id: expenseId,
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                  })
                  .eq('id', match.installment.id)
                  .eq('user_id', user.id)
                  .is('expense_id', null); // race-guard

                if (!updErr) {
                  usedInstallmentIds.add(match.installment.id);
                  linkedInstallmentsCount += 1;
                }
              }
            }
          }
        } catch (linkErr) {
          console.warn('[importFromCSV] installment linking failed (non-fatal):', linkErr);
        }


        // Update balance ONLY for actually inserted rows. Mergeani NE diraju
        // balans jer je ručni unos već utjecao prije merge-a.
        for (const tx of newExpenses) {
          const txType = tx.type as TransactionType;
          if (txType === 'transfer') {
            await updateBalance(tx.payment_source, tx.amount, 'transfer');
            if (tx.income_source_id) {
              await updateBalance(tx.income_source_id, tx.amount, 'income');
            }
          } else {
            await updateBalance(tx.payment_source, tx.amount, txType);
          }
        }
        onBalanceUpdated?.();

        setExpenses(prev => [...newExpenses, ...prev].sort(
          (a, b) => b.date.getTime() - a.date.getTime()
        ));

        if (insertedData.length === 0 && mergedCount === 0) {
          toast.info(t('import.allAlreadyExists', { count: transactions.length, defaultValue: `Nema novih transakcija — svih ${transactions.length} već postoji.` }));
        } else if (mergedCount > 0 && skippedCount > 0) {
          showSuccess(t('import.summaryFull', { inserted: insertedData.length, merged: mergedCount, skipped: skippedCount, defaultValue: `Uvezeno ${insertedData.length} novih, spojeno ${mergedCount} s ručnim, ${skippedCount} već postoji.` }));
        } else if (mergedCount > 0) {
          showSuccess(t('import.summaryWithMerged', { inserted: insertedData.length, merged: mergedCount, defaultValue: `Uvezeno ${insertedData.length} novih, spojeno ${mergedCount} s ručnim unosima.` }));
        } else if (skippedCount > 0) {
          showSuccess(t('import.summaryWithSkipped', { inserted: insertedData.length, skipped: skippedCount, defaultValue: `Uvezeno ${insertedData.length} novih, ${skippedCount} već postoji.` }));
        } else {
          showSuccess(t('import.importedTransactions', { count: insertedData.length }));
        }

        try { opts?.onMeta?.({ batchId, inserted: insertedData.length, merged: mergedCount, skipped: skippedCount }); } catch {}
      }

    } catch (error) {
      console.error('Error importing CSV:', error);
      showError(t('toasts.importError'));
      throw error;
    }
  }, [isLocalMode, user, authReady, activeBusinessProfileId, setExpenses, updateBalance, onBalanceUpdated, t, normalizeCtx]);

  return { addExpense, updateExpense, bulkUpdateExpenses, deleteExpense, importFromCSV };
};
