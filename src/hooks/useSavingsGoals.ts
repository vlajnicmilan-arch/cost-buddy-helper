import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SavingsGoal } from '@/types/budget';
import { toast } from 'sonner';

export const useSavingsGoals = (budgetId: string | null) => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (!budgetId || !user) {
      setGoals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setGoals((data || []).map(g => ({
        ...g,
        target_amount: Number(g.target_amount),
        current_amount: Number(g.current_amount)
      })));
    } catch (error) {
      console.error('Error fetching savings goals:', error);
    } finally {
      setLoading(false);
    }
  }, [budgetId, user]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const addGoal = async (goalData: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>) => {
    if (!budgetId) return;

    try {
      const { error } = await supabase
        .from('savings_goals')
        .insert(goalData);

      if (error) throw error;

      toast.success('Cilj štednje kreiran');
      await fetchGoals();
    } catch (error) {
      console.error('Error adding goal:', error);
      toast.error('Greška pri kreiranju cilja');
    }
  };

  const updateGoal = async (goal: SavingsGoal) => {
    try {
      const isNowCompleted = goal.current_amount >= goal.target_amount && !goal.is_completed;
      
      const { error } = await supabase
        .from('savings_goals')
        .update({
          name: goal.name,
          description: goal.description,
          icon: goal.icon,
          color: goal.color,
          target_amount: goal.target_amount,
          current_amount: goal.current_amount,
          target_date: goal.target_date,
          is_completed: isNowCompleted ? true : goal.is_completed,
          completed_at: isNowCompleted ? new Date().toISOString() : goal.completed_at
        })
        .eq('id', goal.id);

      if (error) throw error;

      if (isNowCompleted) {
        toast.success('🎉 Cilj postignut!');
      } else {
        toast.success('Cilj ažuriran');
      }
      await fetchGoals();
    } catch (error) {
      console.error('Error updating goal:', error);
      toast.error('Greška pri ažuriranju cilja');
    }
  };

  const addToGoal = async (goalId: string, amount: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const newAmount = goal.current_amount + amount;
    await updateGoal({ ...goal, current_amount: newAmount });
  };

  const deleteGoal = async (id: string) => {
    try {
      const { error } = await supabase
        .from('savings_goals')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Cilj obrisan');
      await fetchGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
      toast.error('Greška pri brisanju cilja');
    }
  };

  return {
    goals,
    loading,
    addGoal,
    updateGoal,
    addToGoal,
    deleteGoal,
    refetch: fetchGoals
  };
};
