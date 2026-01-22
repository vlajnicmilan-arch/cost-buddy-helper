import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, PaymentSource, ReceiptItem } from '@/types/expense';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { ParsedTransaction } from '@/lib/csvParsers';

export const useExpenses = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = useCallback(async () => {
    if (!user) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    try {
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
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Greška pri učitavanju troškova');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const addExpense = async (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    items?: ReceiptItem[]
  ) => {
    if (!user) {
      toast.error('Moraš biti prijavljen');
      return;
    }

    try {
      // Insert expense
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

      // Insert receipt items if provided
      if (items && items.length > 0 && data) {
        const itemsToInsert = items.map(item => ({
          expense_id: data.id,
          name: item.name,
          quantity: item.quantity || 1,
          unit_price: item.unit_price || null,
          total_price: item.total_price
        }));

        const { error: itemsError } = await supabase
          .from('receipt_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('Error inserting receipt items:', itemsError);
          // Don't fail the whole operation, just log
        }
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
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Greška pri dodavanju');
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setExpenses(prev => prev.filter(e => e.id !== id));
      toast.success('Trošak obrisan');
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Greška pri brisanju troška');
    }
  };

  const importFromCSV = async (transactions: ParsedTransaction[]) => {
    if (!user) {
      toast.error('Moraš biti prijavljen');
      return;
    }

    try {
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
    refetch: fetchExpenses
  };
};
