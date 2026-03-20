import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useAppState } from '@/contexts/AppStateContext';
import { toast } from 'sonner';

export interface RecurringTransaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  category: string;
  payment_source: string | null;
  payment_source_card_id: string | null;
  income_source_id: string | null;
  merchant_name: string | null;
  note: string | null;
  transfer_to_source: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  day_of_month: number | null;
  day_of_week: number | null;
  next_due_date: string;
  last_generated_date: string | null;
  is_active: boolean;
  business_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurringTransactionInsert = Omit<RecurringTransaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export const useRecurringTransactions = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { activeBusinessProfileId } = useAppState();
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocalMode = storageMode === 'local' && !user;

  const fetchRecurring = useCallback(async () => {
    if (isLocalMode || !user) {
      setRecurringTransactions([]);
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('recurring_transactions')
        .select('*')
        .order('next_due_date', { ascending: true });

      if (activeBusinessProfileId) {
        query = query.eq('business_profile_id', activeBusinessProfileId);
      } else {
        query = query.is('business_profile_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRecurringTransactions((data || []) as unknown as RecurringTransaction[]);
    } catch (error) {
      console.error('Error fetching recurring transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode, activeBusinessProfileId]);

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  const addRecurring = async (recurring: RecurringTransactionInsert) => {
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('recurring_transactions')
      .insert({
        ...recurring,
        user_id: user.id,
      } as any);

    if (error) {
      console.error('Error adding recurring transaction:', error);
      toast.error(`Greška pri dodavanju: ${error.message}`);
      throw error;
    }
    toast.success('Ponavljajuća transakcija dodana');
    await fetchRecurring();
  };

  const updateRecurring = async (id: string, updates: Partial<RecurringTransactionInsert>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('recurring_transactions')
        .update(updates as any)
        .eq('id', id);

      if (error) throw error;
      toast.success('Ažurirano');
      await fetchRecurring();
    } catch (error) {
      console.error('Error updating recurring transaction:', error);
      toast.error('Greška pri ažuriranju');
    }
  };

  const deleteRecurring = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('recurring_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Ponavljajuća transakcija obrisana');
      setRecurringTransactions(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error('Error deleting recurring transaction:', error);
      toast.error('Greška pri brisanju');
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await updateRecurring(id, { is_active: isActive });
  };

  // Process due recurring transactions - generates actual expenses
  const processDueTransactions = useCallback(async (
    addExpense: (expense: any) => Promise<void>
  ) => {
    if (!user || isLocalMode) return 0;

    const today = new Date().toISOString().split('T')[0];
    const dueTransactions = recurringTransactions.filter(
      r => r.is_active && r.next_due_date <= today
    );

    let generated = 0;

    for (const recurring of dueTransactions) {
      try {
        // Create the expense
        await addExpense({
          amount: recurring.amount,
          description: recurring.description,
          category: recurring.category,
          type: recurring.type,
          date: new Date(recurring.next_due_date),
          payment_source: recurring.payment_source || 'cash',
          payment_source_card_id: recurring.payment_source_card_id,
          income_source_id: recurring.type === 'transfer' ? recurring.transfer_to_source : recurring.income_source_id,
          merchant_name: recurring.merchant_name,
          note: recurring.note ? `${recurring.note} (auto)` : '(ponavljajuća transakcija)',
        });

        // Calculate next due date
        const nextDate = calculateNextDueDate(
          new Date(recurring.next_due_date),
          recurring.frequency,
          recurring.day_of_month,
          recurring.day_of_week
        );

        // Update the recurring transaction
        await supabase
          .from('recurring_transactions')
          .update({
            next_due_date: nextDate.toISOString().split('T')[0],
            last_generated_date: today,
          } as any)
          .eq('id', recurring.id);

        generated++;
      } catch (error) {
        console.error('Error processing recurring transaction:', recurring.id, error);
      }
    }

    if (generated > 0) {
      await fetchRecurring();
      toast.info(`Generirano ${generated} ponavljajućih transakcija`);
    }

    return generated;
  }, [user, isLocalMode, recurringTransactions, fetchRecurring]);

  return {
    recurringTransactions,
    loading,
    addRecurring,
    updateRecurring,
    deleteRecurring,
    toggleActive,
    processDueTransactions,
    refetch: fetchRecurring,
  };
};

function calculateNextDueDate(
  currentDate: Date,
  frequency: string,
  dayOfMonth: number | null,
  dayOfWeek: number | null
): Date {
  const next = new Date(currentDate);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  return next;
}
