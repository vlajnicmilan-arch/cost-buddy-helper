import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BudgetPlan, BudgetPlanWithOwnership } from '@/types/budget';
import { toast } from 'sonner';

export const useBudgetPlans = () => {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<BudgetPlanWithOwnership[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = useCallback(async () => {
    if (!user) {
      setBudgets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch budgets user owns
      const { data: ownedBudgets, error: ownedError } = await supabase
        .from('budget_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (ownedError) throw ownedError;

      // Fetch budgets user is member of
      const { data: memberships, error: memberError } = await supabase
        .from('budget_members')
        .select('budget_id, role')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const memberBudgetIds = memberships
        ?.filter(m => !ownedBudgets?.some(b => b.id === m.budget_id))
        .map(m => m.budget_id) || [];

      let sharedBudgets: any[] = [];
      if (memberBudgetIds.length > 0) {
        const { data, error } = await supabase
          .from('budget_plans')
          .select('*')
          .in('id', memberBudgetIds);

        if (error) throw error;
        sharedBudgets = data || [];
      }

      // Create lookup for roles
      const roleMap: Record<string, string> = {};
      memberships?.forEach(m => {
        roleMap[m.budget_id] = m.role;
      });

      // Combine and add ownership info
      const allBudgets: BudgetPlanWithOwnership[] = [
        ...(ownedBudgets || []).map(b => ({
          ...b,
          isOwner: true,
          role: 'owner' as const
        })),
        ...sharedBudgets.map(b => ({
          ...b,
          isOwner: false,
          role: (roleMap[b.id] || 'viewer') as 'owner' | 'member' | 'viewer'
        }))
      ];

      setBudgets(allBudgets);
    } catch (error) {
      console.error('Error fetching budgets:', error);
      toast.error('Greška pri učitavanju budžeta');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const addBudget = async (budgetData: Omit<BudgetPlan, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('budget_plans')
        .insert({
          ...budgetData,
          user_id: user.id
        });

      if (error) throw error;

      toast.success('Budžet kreiran');
      await fetchBudgets();
    } catch (error) {
      console.error('Error adding budget:', error);
      toast.error('Greška pri kreiranju budžeta');
    }
  };

  const updateBudget = async (budget: BudgetPlan) => {
    try {
      const { error } = await supabase
        .from('budget_plans')
        .update({
          name: budget.name,
          description: budget.description,
          icon: budget.icon,
          color: budget.color,
          period_type: budget.period_type,
          start_date: budget.start_date,
          end_date: budget.end_date,
          is_active: budget.is_active
        })
        .eq('id', budget.id);

      if (error) throw error;

      toast.success('Budžet ažuriran');
      await fetchBudgets();
    } catch (error) {
      console.error('Error updating budget:', error);
      toast.error('Greška pri ažuriranju budžeta');
    }
  };

  const deleteBudget = async (id: string) => {
    try {
      const { error } = await supabase
        .from('budget_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Budžet obrisan');
      await fetchBudgets();
    } catch (error) {
      console.error('Error deleting budget:', error);
      toast.error('Greška pri brisanju budžeta');
    }
  };

  return {
    budgets,
    loading,
    addBudget,
    updateBudget,
    deleteBudget,
    refetch: fetchBudgets
  };
};
