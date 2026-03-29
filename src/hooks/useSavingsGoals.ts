import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAppState } from '@/contexts/AppStateContext';

export interface SavingsGoal {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  user_id: string;
}

export function useSavingsGoals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { emitAvatarEvent } = useAppState();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (storageMode !== 'cloud' || !user) {
      setGoals([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', user.id)
        .is('budget_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGoals((data || []) as SavingsGoal[]);
    } catch (err) {
      console.error('Error fetching savings goals:', err);
    } finally {
      setLoading(false);
    }
  }, [user, storageMode]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const addGoal = useCallback(async (goal: Omit<SavingsGoal, 'id' | 'created_at' | 'user_id' | 'is_completed' | 'completed_at'>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('savings_goals')
        .insert({
          ...goal,
          user_id: user.id,
          budget_id: null,
        });

      if (error) throw error;
      toast.success(t('savingsGoals.goalAdded'));
      fetchGoals();
    } catch (err) {
      console.error('Error adding savings goal:', err);
      toast.error(t('savingsGoals.errorAdding'));
    }
  }, [user, fetchGoals, t]);

  const updateGoal = useCallback(async (id: string, updates: Partial<SavingsGoal>) => {
    try {
      const { error } = await supabase
        .from('savings_goals')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success(t('savingsGoals.goalUpdated'));
      fetchGoals();
    } catch (err) {
      console.error('Error updating savings goal:', err);
      toast.error(t('savingsGoals.errorUpdating'));
    }
  }, [fetchGoals, t]);

  const deleteGoal = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('savings_goals')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success(t('savingsGoals.goalDeleted'));
      fetchGoals();
    } catch (err) {
      console.error('Error deleting savings goal:', err);
      toast.error(t('savingsGoals.errorDeleting'));
    }
  }, [fetchGoals, t]);

  const addAmount = useCallback(async (id: string, amount: number) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;

    const newAmount = goal.current_amount + amount;
    const isCompleted = newAmount >= goal.target_amount;

    await updateGoal(id, {
      current_amount: newAmount,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    });

    if (isCompleted) {
      emitAvatarEvent('proud', 'Bravo! Cilj ostvaren! 🎉');
      toast.success(t('savingsGoals.goalCompleted', { name: goal.name }));
    } else {
      emitAvatarEvent('happy', 'Sjajno, štedeš! 🐷');
    }
  }, [goals, updateGoal, t, emitAvatarEvent]);

  return { goals, loading, addGoal, updateGoal, deleteGoal, addAmount, refetch: fetchGoals };
}
