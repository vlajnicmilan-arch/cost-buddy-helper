import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category } from '@/types/expense';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

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
        type: e.type as 'expense' | 'income'
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

  const addExpense = async (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) {
      toast.error('Moraš biti prijavljen');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          amount: expense.amount,
          description: expense.description,
          category: expense.category,
          type: expense.type,
          date: expense.date.toISOString(),
          receipt_url: expense.receipt_url,
          merchant_name: expense.merchant_name,
          ai_extracted: expense.ai_extracted
        })
        .select()
        .single();

      if (error) throw error;

      const newExpense: Expense = {
        ...data,
        date: new Date(data.date),
        category: data.category as Category,
        type: data.type as 'expense' | 'income'
      };

      setExpenses(prev => [newExpense, ...prev]);
      toast.success('Trošak dodan');
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Greška pri dodavanju troška');
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
    totalExpenses,
    totalIncome,
    balance,
    expensesByCategory,
    refetch: fetchExpenses
  };
};
