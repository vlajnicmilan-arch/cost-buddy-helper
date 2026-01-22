import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, ReceiptItem } from '@/types/expense';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { toast } from 'sonner';
import { ParsedTransaction } from '@/lib/csvParsers';
import {
  getLocalExpenses,
  saveLocalExpense,
  deleteLocalExpense,
  saveLocalReceiptItems,
  initLocalDB
} from '@/lib/storage/indexedDB';

export const useExpenses = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocalMode = storageMode === 'local';

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
          type: e.type as 'expense' | 'income',
          payment_source: (e.payment_source || 'cash') as PaymentSource
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
            ai_extracted: expense.ai_extracted
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
          type: data.type as 'expense' | 'income',
          payment_source: (data.payment_source || 'cash') as PaymentSource
        };

        setExpenses(prev => [newExpense, ...prev]);
        toast.success(expense.type === 'income' ? 'Prihod dodan' : 'Trošak dodan');
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Greška pri dodavanju');
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
            payment_source: 'other',
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
          type: e.type as 'expense' | 'income',
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

  const totalExpenses = expenses
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalIncome = expenses
    .filter(e => e.type === 'income')
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
    deleteExpense,
    importFromCSV,
    totalExpenses,
    totalIncome,
    balance,
    expensesByCategory,
    refetch: fetchExpenses,
    isLocalMode
  };
};
