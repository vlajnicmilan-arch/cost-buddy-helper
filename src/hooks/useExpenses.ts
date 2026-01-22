import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, ReceiptItem, TransactionType } from '@/types/expense';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
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

export const useExpenses = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // If user is logged in, always use cloud mode regardless of storageMode setting
  // Only use local mode if explicitly set AND user is not logged in
  const isLocalMode = storageMode === 'local' && !user;

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

        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false });

        if (error) throw error;

        setExpenses(data?.map(e => ({
          ...e,
          date: new Date(e.date),
          category: e.category as Category,
          type: e.type as TransactionType,
          payment_source: (e.payment_source || 'cash') as PaymentSource,
          income_source_id: e.income_source_id
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
    fetchExpenses();
  }, [fetchExpenses]);

  const addExpense = async (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    items?: ReceiptItem[]
  ) => {
    try {
      if (isLocalMode) {
        const newExpense = await saveLocalExpense(expense);
        
        if (items && items.length > 0) {
          await saveLocalReceiptItems(newExpense.id, items);
        }

        setExpenses(prev => [newExpense, ...prev]);
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
            receipt_url: expense.receipt_url,
            merchant_name: expense.merchant_name,
            ai_extracted: expense.ai_extracted,
            income_source_id: expense.income_source_id
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

        const newExpense: Expense = {
          ...data,
          date: new Date(data.date),
          category: data.category as Category,
          type: data.type as TransactionType,
          payment_source: (data.payment_source || 'cash') as PaymentSource,
          income_source_id: data.income_source_id
        };

        setExpenses(prev => [newExpense, ...prev]);
        toast.success(expense.type === 'income' ? 'Prihod dodan' : 'Trošak dodan');
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Greška pri dodavanju');
    }
  };

  const updateExpense = async (expense: Expense) => {
    try {
      if (isLocalMode) {
        const updated = await updateLocalExpense(expense);
        setExpenses(prev => prev.map(e => e.id === expense.id ? updated : e));
        toast.success('Ažurirano');
      } else {
        if (!user) {
          toast.error('Moraš biti prijavljen');
          return;
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
            merchant_name: expense.merchant_name,
            income_source_id: expense.income_source_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', expense.id);

        if (error) throw error;

        setExpenses(prev => prev.map(e => e.id === expense.id ? expense : e));
        toast.success('Ažurirano');
      }
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error('Greška pri ažuriranju');
    }
  };

  const deleteExpense = async (id: string) => {
    try {
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
          payment_source: (e.payment_source || 'cash') as PaymentSource
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

  // Exclude transfers from totals
  const totalExpenses = expenses
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalIncome = expenses
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalTransfers = expenses
    .filter(e => e.type === 'transfer')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const balance = totalIncome - totalExpenses;

  const expensesByCategory = expenses
    .filter(e => e.type === 'expense')
    .reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
      return acc;
    }, {} as Record<string, number>);

  return {
    expenses,
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
    importFromCSV,
    findDuplicates,
    totalExpenses,
    totalIncome,
    balance,
    expensesByCategory,
    refetch: fetchExpenses,
    isLocalMode
  };
};
