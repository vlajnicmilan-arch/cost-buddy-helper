import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, ReceiptItem, TransactionType } from '@/types/expense';
import { useAuth } from './useAuth';
import { useBalanceUpdater } from './useBalanceUpdater';
import { useBudgetAlerts } from './useBudgetAlerts';
import { useAppState } from '@/contexts/AppStateContext';
import { toast } from 'sonner';
import { ParsedTransaction } from '@/lib/csvParsers';
import {
  saveLocalExpense,
  updateLocalExpense,
  deleteLocalExpense,
  saveLocalReceiptItems,
  getLocalExpenses,
} from '@/lib/storage/indexedDB';

interface UseExpenseCRUDOptions {
  isLocalMode: boolean;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  onBalanceUpdated?: () => void;
}

export const useExpenseCRUD = ({
  isLocalMode,
  expenses,
  setExpenses,
  onBalanceUpdated,
}: UseExpenseCRUDOptions) => {
  const { user } = useAuth();
  const { updateBalance, handleTransactionUpdate } = useBalanceUpdater({ onBalanceUpdated });
  const { checkBudgetAlerts } = useBudgetAlerts();
  const { emitAvatarEvent } = useAppState();

  const addExpense = useCallback(async (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    items?: ReceiptItem[],
    isPendingMemberTransaction?: boolean
  ) => {
    try {
      if (isLocalMode) {
        const newExpense = await saveLocalExpense(expense);
        if (items && items.length > 0) await saveLocalReceiptItems(newExpense.id, items);
        setExpenses(prev => [newExpense, ...prev]);
        await updateBalance(expense.payment_source, expense.amount, expense.type);
        if (expense.type === 'transfer' && expense.income_source_id) {
          await updateBalance(expense.income_source_id, expense.amount, 'income');
        }
        if (expense.type === 'income') emitAvatarEvent('happy', 'Super! Novi prihod zabilježen! 💰');
        toast.success(expense.type === 'income' ? 'Prihod dodan' : 'Trošak dodan');
      } else {
        if (!user) { toast.error('Moraš biti prijavljen'); return; }

        const { data, error } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            amount: expense.amount,
            description: expense.description,
            category: expense.category,
            type: expense.type,
            date: expense.date.toISOString(),
            payment_source: expense.payment_source || 'cash',
            payment_source_card_id: expense.payment_source_card_id || null,
            receipt_url: expense.receipt_url,
            merchant_name: expense.merchant_name,
            ai_extracted: expense.ai_extracted,
            income_source_id: expense.income_source_id,
            project_id: expense.project_id || null,
            budget_id: expense.budget_id || null,
            note: expense.note || null,
            expense_nature: expense.expense_nature || null,
            status: isPendingMemberTransaction ? 'pending' : 'approved',
            submitted_by: isPendingMemberTransaction ? user.id : null
          })
          .select()
          .single();

        if (error) throw error;

        if (items && items.length > 0 && data) {
          await supabase.from('receipt_items').insert(items.map(item => ({
            expense_id: data.id,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || null,
            total_price: item.total_price
          })));
        }

        // Notifications (fire-and-forget, don't block)
        if (isPendingMemberTransaction && expense.income_source_id && data) {
          supabase.functions.invoke('notify-pending-transaction', {
            body: { expense_id: data.id, income_source_id: expense.income_source_id }
          }).catch(e => console.error('Notification error:', e));
        }
        if (expense.project_id && data) {
          supabase.functions.invoke('notify-project-transaction', {
            body: { expense_id: data.id, project_id: expense.project_id, action: 'created' }
          }).catch(e => console.error('Notification error:', e));
        }
        if (expense.note && expense.income_source_id && data) {
          supabase.functions.invoke('notify-note-added', {
            body: { expense_id: data.id, income_source_id: expense.income_source_id, note: expense.note }
          }).catch(e => console.error('Notification error:', e));
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

        setExpenses(prev => [newExpense, ...prev]);

        const savedIncomeSourceId = data.income_source_id || expense.income_source_id;
        await updateBalance(expense.payment_source, expense.amount, expense.type);
        if (expense.type === 'transfer' && savedIncomeSourceId) {
          await updateBalance(savedIncomeSourceId, expense.amount, 'income').catch(e =>
            console.error('Destination balance update failed:', e)
          );
        }
        if (expense.type === 'expense') checkBudgetAlerts(expense.category, expense.amount, expense.date);
        if (expense.type === 'income') emitAvatarEvent('happy', 'Super! Novi prihod zabilježen! 💰');

        if (isPendingMemberTransaction) {
          toast.success('Transakcija poslana vlasniku na odobrenje');
        } else {
          toast.success(expense.type === 'income' ? 'Prihod dodan' : 'Trošak dodan');
        }
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Greška pri dodavanju');
    }
  }, [isLocalMode, user, setExpenses, updateBalance, emitAvatarEvent, checkBudgetAlerts]);

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
        toast.success('Ažurirano');
      } else {
        if (!user) { toast.error('Moraš biti prijavljen'); return; }

        if (!oldExpense) {
          const { data: dbOldExpense } = await supabase
            .from('expenses').select('*').eq('id', expense.id).maybeSingle();
          if (dbOldExpense) oldExpense = dbOldExpense as unknown as Expense;
        }

        const { error } = await supabase
          .from('expenses')
          .update({
            amount: expense.amount,
            description: expense.description,
            category: expense.category,
            type: expense.type,
            date: expense.date instanceof Date ? expense.date.toISOString() : expense.date,
            payment_source: expense.payment_source || 'cash',
            payment_source_card_id: expense.payment_source_card_id || null,
            merchant_name: expense.merchant_name,
            income_source_id: expense.income_source_id,
            project_id: expense.project_id || null,
            budget_id: expense.budget_id || null,
            expense_nature: expense.expense_nature || null,
            note: expense.note || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', expense.id);

        if (error) throw error;

        setExpenses(prev => prev.map(e => e.id === expense.id ? expense : e));

        if (oldExpense) {
          await handleTransactionUpdate(
            oldExpense.payment_source, oldExpense.amount, oldExpense.type,
            expense.payment_source, expense.amount, expense.type,
            oldExpense.income_source_id, expense.income_source_id
          );
          onBalanceUpdated?.();
        } else {
          console.warn('Could not find old expense for balance update:', expense.id);
        }

        // Notifications (fire-and-forget)
        const projectChanged = expense.project_id !== oldExpense?.project_id;
        const significantChange = expense.amount !== oldExpense?.amount ||
          expense.description !== oldExpense?.description || expense.type !== oldExpense?.type;
        if (expense.project_id && (projectChanged || significantChange)) {
          supabase.functions.invoke('notify-project-transaction', {
            body: { expense_id: expense.id, project_id: expense.project_id, action: 'updated' }
          }).catch(e => console.error('Notification error:', e));
        }
        const noteWasAdded = expense.note && (!oldExpense?.note || oldExpense.note !== expense.note);
        if (noteWasAdded && expense.income_source_id) {
          supabase.functions.invoke('notify-note-added', {
            body: { expense_id: expense.id, income_source_id: expense.income_source_id, note: expense.note }
          }).catch(e => console.error('Notification error:', e));
        }

        toast.success('Ažurirano');
      }
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error('Greška pri ažuriranju');
    }
  }, [isLocalMode, user, expenses, setExpenses, handleTransactionUpdate, onBalanceUpdated]);

  const bulkUpdateExpenses = useCallback(async (expensesToUpdate: Expense[]) => {
    try {
      if (isLocalMode) {
        await Promise.all(expensesToUpdate.map(expense => updateLocalExpense(expense)));
        setExpenses(prev => {
          const updatedMap = new Map(expensesToUpdate.map(e => [e.id, e]));
          return prev.map(e => updatedMap.get(e.id) || e);
        });
        toast.success(`Ažurirano ${expensesToUpdate.length} transakcija`);
      } else {
        if (!user) { toast.error('Moraš biti prijavljen'); return; }

        await Promise.all(expensesToUpdate.map(async (expense) => {
          const { error } = await supabase
            .from('expenses')
            .update({
              category: expense.category,
              payment_source: expense.payment_source || 'cash',
              updated_at: new Date().toISOString()
            })
            .eq('id', expense.id);
          if (error) throw error;
        }));

        setExpenses(prev => {
          const updatedMap = new Map(expensesToUpdate.map(e => [e.id, e]));
          return prev.map(e => updatedMap.get(e.id) || e);
        });
      }
    } catch (error) {
      console.error('Error bulk updating expenses:', error);
      toast.error('Greška pri grupnom ažuriranju');
      throw error;
    }
  }, [isLocalMode, user, setExpenses]);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      // Look up from local state first; if not found (e.g. shared/member transaction), fetch from DB
      let expenseToDelete = expenses.find(e => e.id === id);

      if (!expenseToDelete && !isLocalMode && user) {
        const { data } = await supabase.from('expenses').select('*').eq('id', id).maybeSingle();
        if (data) expenseToDelete = data as unknown as Expense;
      }

      if (isLocalMode) {
        await deleteLocalExpense(id);
      } else {
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (error) throw error;
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

      toast.success('Obrisano');
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Greška pri brisanju');
    }
  }, [isLocalMode, user, expenses, setExpenses, updateBalance, onBalanceUpdated]);

  const importFromCSV = useCallback(async (transactions: ParsedTransaction[]) => {
    try {
      const batchId = crypto.randomUUID();
      
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
          // Update balance for each imported transaction
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
        toast.success(`Uvezeno ${transactions.length} transakcija`);
      } else {
        if (!user) { toast.error('Moraš biti prijavljen'); return; }

        const rows = transactions.map(tx => ({
          user_id: user.id,
          amount: tx.amount,
          description: tx.description,
          category: tx.category,
          type: tx.type,
          date: tx.date.toISOString(),
          payment_source: tx.payment_source || 'other',
          merchant_name: tx.merchant_name || null,
          ai_extracted: false,
          import_batch_id: batchId
        }));

        // Try bulk insert first; on failure, fall back to individual inserts
        const { data, error } = await supabase
          .from('expenses')
          .insert(rows)
          .select();

        let insertedData = data;

        if (error) {
          console.warn('Bulk insert failed, falling back to individual inserts:', error.message);
          insertedData = [];
          let failCount = 0;
          for (const row of rows) {
            const { data: single, error: singleErr } = await supabase
              .from('expenses')
              .insert(row)
              .select()
              .single();
            if (singleErr) {
              console.error('Individual insert failed:', singleErr.message, row.description);
              failCount++;
            } else if (single) {
              insertedData.push(single);
            }
          }
          if (failCount > 0) {
            toast.warning(`${failCount} transakcija nije uspjelo uvesti`);
          }
        }

        const newExpenses: Expense[] = (insertedData || []).map(e => ({
          ...e,
          date: new Date(e.date),
          category: e.category as Category,
          type: e.type as TransactionType,
          payment_source: (e.payment_source || 'cash') as PaymentSource,
          expense_nature: (e.expense_nature as 'regular' | 'extraordinary') || undefined
        }));

        // Update balances for all imported transactions
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
        toast.success(`Uvezeno ${newExpenses.length} transakcija`);
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      toast.error('Greška pri uvozu transakcija');
      throw error;
    }
  }, [isLocalMode, user, setExpenses, updateBalance, onBalanceUpdated]);

  return { addExpense, updateExpense, bulkUpdateExpenses, deleteExpense, importFromCSV };
};
