import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, ReceiptItem, TransactionType } from '@/types/expense';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useBalanceUpdater } from './useBalanceUpdater';
import { useBudgetAlerts } from './useBudgetAlerts';
import { toast } from 'sonner';
import { ParsedTransaction } from '@/lib/csvParsers';
import {
  getLocalExpenses,
  saveLocalExpense,
  updateLocalExpense,
  deleteLocalExpense,
  saveLocalReceiptItems,
  initLocalDB
} from '@/lib/storage/indexedDB';

interface UseExpensesOptions {
  onBalanceUpdated?: () => void;
}

export const useExpenses = (options?: UseExpensesOptions) => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { updateBalance, handleTransactionUpdate } = useBalanceUpdater({
    onBalanceUpdated: options?.onBalanceUpdated
  });
  const { checkBudgetAlerts } = useBudgetAlerts();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ownedSourceIds, setOwnedSourceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // If user is logged in, always use cloud mode regardless of storageMode setting
  // Only use local mode if explicitly set AND user is not logged in
  const isLocalMode = storageMode === 'local' && !user;

  // Fetch owned income source IDs
  const fetchOwnedSources = useCallback(async () => {
    if (isLocalMode || !user) {
      setOwnedSourceIds(new Set());
      return;
    }

    try {
      const { data, error } = await supabase
        .from('income_sources')
        .select('id')
        .eq('user_id', user.id);

      if (error) throw error;
      setOwnedSourceIds(new Set((data || []).map(s => s.id)));
    } catch (error) {
      console.error('Error fetching owned sources:', error);
    }
  }, [user, isLocalMode]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);

    try {
      if (isLocalMode) {
        await initLocalDB();
        const localExpenses = await getLocalExpenses();
        setExpenses(localExpenses);
      } else {
        if (!user) {
          setExpenses([]);
          setLoading(false);
          return;
        }

        // Fetch all expenses user can access (own + shared income sources via RLS)
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .order('date', { ascending: false });

        if (error) throw error;

        setExpenses(data?.map(e => ({
          ...e,
          date: new Date(e.date),
          category: e.category as Category,
          type: e.type as TransactionType,
          payment_source: (e.payment_source || 'cash') as PaymentSource,
          income_source_id: e.income_source_id,
          payment_source_card_id: e.payment_source_card_id,
          expense_nature: (e.expense_nature as 'regular' | 'extraordinary') || undefined
        })) || []);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Greška pri učitavanju troškova');
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode]);

  useEffect(() => {
    fetchOwnedSources();
    fetchExpenses();
  }, [fetchOwnedSources, fetchExpenses]);

  // Filter expenses for dashboard display (exclude shared source/project transactions where user is not owner)
  const dashboardExpenses = useMemo(() => {
    if (isLocalMode || !user) return expenses;
    
    return expenses.filter(expense => {
      // Project transaction - only show if user is the owner (user_id matches)
      if (expense.project_id) {
        return expense.user_id === user.id;
      }
      
      // Personal transaction (no income source) - always show
      if (!expense.income_source_id) return true;
      
      // Transaction from owned income source - show in dashboard
      if (ownedSourceIds.has(expense.income_source_id)) return true;
      
      // Transaction from shared source where user is member but not owner - hide from dashboard
      return false;
    });
  }, [expenses, ownedSourceIds, isLocalMode, user]);

  const addExpense = async (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    items?: ReceiptItem[],
    isPendingMemberTransaction?: boolean
  ) => {
    try {
      if (isLocalMode) {
        const newExpense = await saveLocalExpense(expense);
        
        if (items && items.length > 0) {
          await saveLocalReceiptItems(newExpense.id, items);
        }

        setExpenses(prev => [newExpense, ...prev]);
        
        // Update payment source balance for local mode
        await updateBalance(expense.payment_source, expense.amount, expense.type);
        if (expense.type === 'transfer' && expense.income_source_id) {
          await updateBalance(expense.income_source_id, expense.amount, 'income');
        }
        
        // Dispatch event for AI avatar reaction
        window.dispatchEvent(new CustomEvent(expense.type === 'income' ? 'incomeAdded' : 'expenseAdded', {
          detail: { amount: expense.amount }
        }));
        
        toast.success(expense.type === 'income' ? 'Prihod dodan' : 'Trošak dodan');
      } else {
        if (!user) {
          toast.error('Moraš biti prijavljen');
          return;
        }

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
          const itemsToInsert = items.map(item => ({
            expense_id: data.id,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || null,
            total_price: item.total_price
          }));

          await supabase.from('receipt_items').insert(itemsToInsert);
        }

        // Notify owner if this is a pending transaction from a member
        if (isPendingMemberTransaction && expense.income_source_id && data) {
          try {
            await supabase.functions.invoke('notify-pending-transaction', {
              body: {
                expense_id: data.id,
                income_source_id: expense.income_source_id
              }
            });
          } catch (notifyError) {
            console.error('Error sending notification:', notifyError);
            // Don't fail the whole operation if notification fails
          }
        }

        // Notify project members when a transaction is added to a project
        if (expense.project_id && data) {
          try {
            await supabase.functions.invoke('notify-project-transaction', {
              body: {
                expense_id: data.id,
                project_id: expense.project_id,
                action: 'created'
              }
            });
          } catch (notifyError) {
            console.error('Error sending project notification:', notifyError);
            // Don't fail the whole operation if notification fails
          }
        }

        // Notify owner if a note was added with the transaction
        if (expense.note && expense.income_source_id && data) {
          try {
            await supabase.functions.invoke('notify-note-added', {
              body: {
                expense_id: data.id,
                income_source_id: expense.income_source_id,
                note: expense.note
              }
            });
          } catch (notifyError) {
            console.error('Error sending note notification:', notifyError);
            // Don't fail the whole operation if notification fails
          }
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

        // Update payment source balance
        await updateBalance(expense.payment_source, expense.amount, expense.type);
        if (expense.type === 'transfer' && expense.income_source_id) {
          await updateBalance(expense.income_source_id, expense.amount, 'income');
        }
        
        // Check budget alerts for expense transactions
        if (expense.type === 'expense') {
          checkBudgetAlerts(expense.category, expense.amount, expense.date);
        }
        
        // Dispatch event for AI avatar reaction
        window.dispatchEvent(new CustomEvent(expense.type === 'income' ? 'incomeAdded' : 'expenseAdded', {
          detail: { amount: expense.amount }
        }));
        
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
  };

  const updateExpense = async (expense: Expense) => {
    try {
      // Find the old expense to compare for balance updates
      // First try local state, then fall back to DB fetch for reliability
      let oldExpense = expenses.find(e => e.id === expense.id);
      
      if (isLocalMode) {
        const updated = await updateLocalExpense(expense);
        setExpenses(prev => prev.map(e => e.id === expense.id ? updated : e));
        
        // Update balances if payment source, amount, or type changed
        if (oldExpense) {
          await handleTransactionUpdate(
            oldExpense.payment_source,
            oldExpense.amount,
            oldExpense.type,
            expense.payment_source,
            expense.amount,
            expense.type
          );
          // CRITICAL: Trigger balance updated callback immediately
          options?.onBalanceUpdated?.();
        }
        
        toast.success('Ažurirano');
      } else {
        if (!user) {
          toast.error('Moraš biti prijavljen');
          return;
        }

        // CRITICAL: Always fetch old expense from DB to ensure accurate balance updates
        if (!oldExpense) {
          const { data: dbOldExpense } = await supabase
            .from('expenses')
            .select('*')
            .eq('id', expense.id)
            .maybeSingle();
          if (dbOldExpense) {
            oldExpense = dbOldExpense as unknown as Expense;
          }
        }

        console.log('Updating expense:', expense.id, 
          'old_payment_source:', oldExpense?.payment_source, 
          'new_payment_source:', expense.payment_source,
          'old_amount:', oldExpense?.amount,
          'new_amount:', expense.amount);
        
        const { error, count } = await supabase
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

        if (error) {
          console.error('Supabase update error:', error);
          throw error;
        }

        console.log('Update successful for expense:', expense.id);
        setExpenses(prev => prev.map(e => e.id === expense.id ? expense : e));
        
        // Update balances - always run even if payment source seems the same
        // to handle amount/type changes
        if (oldExpense) {
          console.log('Running handleTransactionUpdate:', {
            oldSource: oldExpense.payment_source,
            oldAmount: oldExpense.amount,
            oldType: oldExpense.type,
            newSource: expense.payment_source,
            newAmount: expense.amount,
            newType: expense.type
          });
          await handleTransactionUpdate(
            oldExpense.payment_source,
            oldExpense.amount,
            oldExpense.type,
            expense.payment_source,
            expense.amount,
            expense.type
          );
          // CRITICAL: Trigger balance updated callback immediately after DB update
          options?.onBalanceUpdated?.();
        } else {
          console.warn('Could not find old expense for balance update:', expense.id);
        }

        // Notify project members if project changed or transaction was updated
        const projectChanged = expense.project_id !== oldExpense?.project_id;
        const significantChange = expense.amount !== oldExpense?.amount || 
                                  expense.description !== oldExpense?.description ||
                                  expense.type !== oldExpense?.type;
        
        if (expense.project_id && (projectChanged || significantChange)) {
          try {
            await supabase.functions.invoke('notify-project-transaction', {
              body: {
                expense_id: expense.id,
                project_id: expense.project_id,
                action: 'updated'
              }
            });
          } catch (notifyError) {
            console.error('Error sending project notification:', notifyError);
            // Don't fail the whole operation if notification fails
          }
        }

        // Notify owner if a note was added and this is an income source transaction
        const noteWasAdded = expense.note && (!oldExpense?.note || oldExpense.note !== expense.note);
        if (noteWasAdded && expense.income_source_id) {
          try {
            await supabase.functions.invoke('notify-note-added', {
              body: {
                expense_id: expense.id,
                income_source_id: expense.income_source_id,
                note: expense.note
              }
            });
          } catch (notifyError) {
            console.error('Error sending note notification:', notifyError);
            // Don't fail the whole operation if notification fails
          }
        }
        
        toast.success('Ažurirano');
      }
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error('Greška pri ažuriranju');
    }
  };

  // Bulk update expenses (for batch operations like changing payment source)
  const bulkUpdateExpenses = async (expensesToUpdate: Expense[]) => {
    try {
      if (isLocalMode) {
        for (const expense of expensesToUpdate) {
          await updateLocalExpense(expense);
        }
        setExpenses(prev => {
          const updatedMap = new Map(expensesToUpdate.map(e => [e.id, e]));
          return prev.map(e => updatedMap.get(e.id) || e);
        });
        toast.success(`Ažurirano ${expensesToUpdate.length} transakcija`);
      } else {
        if (!user) {
          toast.error('Moraš biti prijavljen');
          return;
        }

        // Update in batches to avoid overwhelming the DB
        for (const expense of expensesToUpdate) {
          const { error } = await supabase
            .from('expenses')
            .update({
              category: expense.category,
              payment_source: expense.payment_source || 'cash',
              updated_at: new Date().toISOString()
            })
            .eq('id', expense.id);

          if (error) throw error;
        }

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
  };

  const deleteExpense = async (id: string) => {
    try {
      // Find the expense before deleting to reverse its balance effect
      const expenseToDelete = expenses.find(e => e.id === id);
      
      if (isLocalMode) {
        await deleteLocalExpense(id);
      } else {
        const { error } = await supabase
          .from('expenses')
          .delete()
          .eq('id', id);

        if (error) throw error;
      }

      setExpenses(prev => prev.filter(e => e.id !== id));
      
      // Reverse the balance effect of the deleted transaction
      if (expenseToDelete) {
        if (expenseToDelete.type === 'transfer') {
          // For transfers: reverse source (add back) and destination (subtract back)
          await updateBalance(expenseToDelete.payment_source, expenseToDelete.amount, 'transfer', true);
          if (expenseToDelete.income_source_id) {
            await updateBalance(expenseToDelete.income_source_id, expenseToDelete.amount, 'income', true);
          }
        } else {
          await updateBalance(
            expenseToDelete.payment_source,
            expenseToDelete.amount,
            expenseToDelete.type,
            true // isReversal = true
          );
        }
      }
      
      toast.success('Obrisano');
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Greška pri brisanju');
    }
  };

  // Check for duplicate transactions
  const findDuplicates = useCallback((transactions: ParsedTransaction[]): {
    duplicates: ParsedTransaction[];
    unique: ParsedTransaction[];
  } => {
    const duplicates: ParsedTransaction[] = [];
    const unique: ParsedTransaction[] = [];

    for (const tx of transactions) {
      // Check if a transaction with same date, amount, and similar description exists
      const isDuplicate = expenses.some(existing => {
        const sameDate = existing.date.toDateString() === tx.date.toDateString();
        const sameAmount = Math.abs(Number(existing.amount) - tx.amount) < 0.01;
        const sameType = existing.type === tx.type;
        
        // Check description similarity (contains key words)
        const existingDesc = existing.description.toLowerCase();
        const txDesc = tx.description.toLowerCase();
        const similarDesc = existingDesc === txDesc || 
          existingDesc.includes(txDesc) || 
          txDesc.includes(existingDesc) ||
          // Check merchant name match
          (existing.merchant_name && tx.merchant_name && 
           existing.merchant_name.toLowerCase() === tx.merchant_name.toLowerCase());

        return sameDate && sameAmount && sameType && similarDesc;
      });

      if (isDuplicate) {
        duplicates.push(tx);
      } else {
        unique.push(tx);
      }
    }

    return { duplicates, unique };
  }, [expenses]);

  // Check if a single transaction might be a duplicate - returns the matching existing transaction
  const checkDuplicate = useCallback((transaction: {
    amount: number;
    description: string;
    date: Date;
    type: string;
    category?: string;
    merchant_name?: string;
  }): Expense | null => {
    const match = expenses.find(existing => {
      const sameDate = existing.date.toDateString() === transaction.date.toDateString();
      const sameAmount = Math.abs(Number(existing.amount) - transaction.amount) < 0.01;
      const sameType = existing.type === transaction.type;
      
      if (!sameDate || !sameAmount || !sameType) return false;
      
      // Check description similarity
      const existingDesc = existing.description.toLowerCase().trim();
      const newDesc = transaction.description.toLowerCase().trim();
      
      // Exact description match is a duplicate
      if (existingDesc === newDesc) {
        // But if merchant names differ, it's not a duplicate
        if (existing.merchant_name && transaction.merchant_name) {
          const existingMerchant = existing.merchant_name.toLowerCase().trim();
          const newMerchant = transaction.merchant_name.toLowerCase().trim();
          if (existingMerchant !== newMerchant) return false;
        }
        return true;
      }
      
      // If descriptions are clearly different (less than 50% word overlap), not a duplicate
      const existingWords = existingDesc.split(/\s+/).filter(w => w.length >= 3);
      const newWords = newDesc.split(/\s+/).filter(w => w.length >= 3);
      const totalUniqueWords = new Set([...existingWords, ...newWords]).size;
      const commonWords = existingWords.filter(w => newWords.includes(w));
      
      // If both have meaningful words but overlap is low, they're different transactions
      if (totalUniqueWords > 0 && commonWords.length / totalUniqueWords < 0.5) return false;
      
      // One contains the other
      if (existingDesc.includes(newDesc) || newDesc.includes(existingDesc)) return true;
      
      // Merchant name exact match with high word overlap
      if (existing.merchant_name && transaction.merchant_name) {
        const existingMerchant = existing.merchant_name.toLowerCase().trim();
        const newMerchant = transaction.merchant_name.toLowerCase().trim();
        if (existingMerchant === newMerchant && commonWords.length >= 2) return true;
      }
      
      // High word overlap (at least 60% of unique words are common)
      if (totalUniqueWords > 0 && commonWords.length / totalUniqueWords >= 0.6) return true;
      
      return false;
    });

    return match || null;
  }, [expenses]);

  const importFromCSV = async (transactions: ParsedTransaction[]) => {
    try {
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
            ai_extracted: false
          });
        }

        const updatedExpenses = await getLocalExpenses();
        setExpenses(updatedExpenses);
        toast.success(`Uvezeno ${transactions.length} transakcija`);
      } else {
        if (!user) {
          toast.error('Moraš biti prijavljen');
          return;
        }

        const expensesToInsert = transactions.map(tx => ({
          user_id: user.id,
          amount: tx.amount,
          description: tx.description,
          category: tx.category,
          type: tx.type,
          date: tx.date.toISOString(),
          payment_source: tx.payment_source || 'other',
          merchant_name: tx.merchant_name || null,
          ai_extracted: false
        }));

        const { data, error } = await supabase
          .from('expenses')
          .insert(expensesToInsert)
          .select();

        if (error) throw error;

        const newExpenses: Expense[] = (data || []).map(e => ({
          ...e,
          date: new Date(e.date),
          category: e.category as Category,
          type: e.type as TransactionType,
          payment_source: (e.payment_source || 'cash') as PaymentSource,
          expense_nature: (e.expense_nature as 'regular' | 'extraordinary') || undefined
        }));

        setExpenses(prev => [...newExpenses, ...prev].sort(
          (a, b) => b.date.getTime() - a.date.getTime()
        ));

        toast.success(`Uvezeno ${transactions.length} transakcija`);
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      toast.error('Greška pri uvozu transakcija');
      throw error;
    }
  };

  // Get current month boundaries
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Calculate totals using dashboardExpenses (filtered for owned sources only)
  const totalExpenses = dashboardExpenses
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalIncome = dashboardExpenses
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalTransfers = dashboardExpenses
    .filter(e => e.type === 'transfer')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // This month's transfers
  const monthlyTransfers = dashboardExpenses
    .filter(e => e.type === 'transfer' && e.date >= currentMonthStart && e.date <= currentMonthEnd)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const transferCount = dashboardExpenses.filter(e => e.type === 'transfer').length;
  const monthlyTransferCount = dashboardExpenses
    .filter(e => e.type === 'transfer' && e.date >= currentMonthStart && e.date <= currentMonthEnd)
    .length;

  const balance = totalIncome - totalExpenses;

  const expensesByCategory = dashboardExpenses
    .filter(e => e.type === 'expense')
    .reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
      return acc;
    }, {} as Record<string, number>);

  return {
    expenses: dashboardExpenses, // For main dashboard display
    allExpenses: expenses, // For income source panels (includes shared)
    loading,
    addExpense,
    updateExpense,
    bulkUpdateExpenses,
    deleteExpense,
    importFromCSV,
    findDuplicates,
    checkDuplicate,
    totalExpenses,
    totalIncome,
    totalTransfers,
    monthlyTransfers,
    transferCount,
    monthlyTransferCount,
    balance,
    expensesByCategory,
    refetch: fetchExpenses,
    isLocalMode
  };
};
