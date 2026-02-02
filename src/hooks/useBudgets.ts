import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useExpenses } from '@/hooks/useExpenses';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { 
  Budget, 
  BudgetCategory, 
  BudgetWithStats, 
  BudgetCategoryWithStats,
  BudgetPeriod 
} from '@/types/budget';
import { Expense } from '@/types/expense';

interface UseBudgetsOptions {
  externalExpenses?: Expense[];
}

export const useBudgets = (options?: UseBudgetsOptions) => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { expenses: internalExpenses } = useExpenses();
  const { t } = useTranslation();
  
  // Use external expenses if provided, otherwise use internal
  const expenses = options?.externalExpenses ?? internalExpenses;
  
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const isLocalMode = storageMode === 'local';

  // Fetch budgets
  const fetchBudgets = useCallback(async () => {
    if (isLocalMode || !user) {
      setLoading(false);
      return;
    }

    try {
      const { data: budgetsData, error: budgetsError } = await supabase
        .from('budget_plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (budgetsError) throw budgetsError;

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('budget_categories')
        .select('*');

      if (categoriesError) throw categoriesError;

      setBudgets((budgetsData || []).map(b => ({
        ...b,
        total_amount: Number(b.total_amount) || 0,
        period_type: b.period_type as BudgetPeriod,
      })));
      setCategories((categoriesData || []).map(c => ({
        ...c,
        limit_amount: Number(c.limit_amount) || 0,
      })));
    } catch (error) {
      console.error('Error fetching budgets:', error);
      toast.error(t('errors.fetchBudgets', 'Greška pri učitavanju budžeta'));
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode, t]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  // Calculate stats for each budget
  const budgetsWithStats = useMemo((): BudgetWithStats[] => {
    const now = new Date();

    return budgets.map(budget => {
      // Get budget categories
      const budgetCategories = categories.filter(c => c.budget_id === budget.id);

      // Calculate date range based on period
      let startDate: Date;
      let endDate: Date;

      if (budget.period_type === 'custom' && budget.start_date && budget.end_date) {
        startDate = new Date(budget.start_date);
        endDate = new Date(budget.end_date);
      } else if (budget.period_type === 'weekly') {
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      } else if (budget.period_type === 'yearly') {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else {
        // Monthly (default)
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }

      // Filter expenses within the period
      // Include expenses that:
      // 1. Are expense type (not income)
      // 2. Within the date range
      // 3. Approved status only
      // 4. Either:
      //    a) Manually linked to this budget (budget_id matches)
      //    b) OR NOT linked to a project (project expenses are separate from personal budgets)
      const periodExpenses = expenses.filter(e => {
        if (e.type !== 'expense') return false;
        if (e.status && e.status !== 'approved') return false; // Only approved
        const expDate = e.date;
        const inPeriod = expDate >= startDate && expDate <= endDate;
        if (!inPeriod) return false;
        
        // If manually assigned to this budget, always include
        if (e.budget_id === budget.id) return true;
        
        // Otherwise, only include if not a project expense (automatic tracking by category)
        if (e.project_id) return false;
        return true;
      });

      // Calculate total spent
      const spent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
      const remaining = budget.total_amount - spent;
      const percentage = budget.total_amount > 0 ? (spent / budget.total_amount) * 100 : 0;

      // Calculate days remaining
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Calculate daily average
      const daysPassed = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const dailyAverage = spent / daysPassed;

      // Calculate trend (compare to previous period)
      const periodLength = endDate.getTime() - startDate.getTime();
      const prevStartDate = new Date(startDate.getTime() - periodLength);
      const prevEndDate = new Date(startDate.getTime() - 1);
      
      const prevPeriodExpenses = expenses.filter(e => {
        if (e.type !== 'expense') return false;
        if (e.status && e.status !== 'approved') return false; // Only approved
        const expDate = e.date;
        const inPeriod = expDate >= prevStartDate && expDate <= prevEndDate;
        if (!inPeriod) return false;
        
        // If manually assigned to this budget, always include
        if (e.budget_id === budget.id) return true;
        
        // Otherwise, only include if not a project expense
        if (e.project_id) return false;
        return true;
      });
      const prevSpent = prevPeriodExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (prevSpent > 0) {
        const changePercent = ((spent - prevSpent) / prevSpent) * 100;
        if (changePercent > 10) trend = 'up';
        else if (changePercent < -10) trend = 'down';
      }

      // Calculate category stats
      const categoriesWithStats: BudgetCategoryWithStats[] = budgetCategories.map(cat => {
        const catExpenses = periodExpenses.filter(e => e.category === cat.category);
        const catSpent = catExpenses.reduce((sum, e) => sum + e.amount, 0);
        const catRemaining = cat.limit_amount - catSpent;
        const catPercentage = cat.limit_amount > 0 ? (catSpent / cat.limit_amount) * 100 : 0;

        return {
          ...cat,
          spent: catSpent,
          remaining: catRemaining,
          percentage: catPercentage,
          isOverBudget: catPercentage >= 100,
          isWarning: catPercentage >= 80 && catPercentage < 100,
        };
      }).sort((a, b) => b.percentage - a.percentage);

      return {
        ...budget,
        spent,
        remaining,
        percentage,
        categories: categoriesWithStats,
        isOverBudget: percentage >= 100,
        isWarning: percentage >= 80 && percentage < 100,
        daysRemaining,
        dailyAverage,
        trend,
      };
    });
  }, [budgets, categories, expenses]);

  // Create budget
  const createBudget = useCallback(async (budgetData: Partial<BudgetWithStats>) => {
    if (isLocalMode || !user) return;

    try {
      const { data: newBudget, error: budgetError } = await supabase
        .from('budget_plans')
        .insert({
          user_id: user.id,
          name: budgetData.name!,
          description: budgetData.description,
          icon: budgetData.icon,
          color: budgetData.color,
          period_type: budgetData.period_type || 'monthly',
          total_amount: budgetData.total_amount || 0,
          start_date: budgetData.start_date,
          end_date: budgetData.end_date,
          is_active: true,
          project_id: budgetData.project_id,
        })
        .select()
        .single();

      if (budgetError) throw budgetError;

      // Create category limits if provided
      if (budgetData.categories && budgetData.categories.length > 0) {
        const categoryInserts = budgetData.categories.map(cat => ({
          budget_id: newBudget.id,
          category: cat.category,
          limit_amount: cat.limit_amount,
          icon: cat.icon,
          color: cat.color,
        }));

        const { error: catError } = await supabase
          .from('budget_categories')
          .insert(categoryInserts);

        if (catError) throw catError;
      }

      toast.success(t('budget.created', 'Budžet kreiran'));
      await fetchBudgets();
    } catch (error) {
      console.error('Error creating budget:', error);
      toast.error(t('errors.createBudget', 'Greška pri kreiranju budžeta'));
    }
  }, [user, isLocalMode, t, fetchBudgets]);

  // Update budget
  const updateBudget = useCallback(async (budgetData: BudgetWithStats) => {
    if (isLocalMode || !user) return;

    try {
      const { error: budgetError } = await supabase
        .from('budget_plans')
        .update({
          name: budgetData.name,
          description: budgetData.description,
          icon: budgetData.icon,
          color: budgetData.color,
          period_type: budgetData.period_type,
          total_amount: budgetData.total_amount,
          start_date: budgetData.start_date,
          end_date: budgetData.end_date,
          is_active: budgetData.is_active,
          project_id: budgetData.project_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', budgetData.id);

      if (budgetError) throw budgetError;

      // Update categories - delete old and insert new
      await supabase
        .from('budget_categories')
        .delete()
        .eq('budget_id', budgetData.id);

      if (budgetData.categories && budgetData.categories.length > 0) {
        const categoryInserts = budgetData.categories.map(cat => ({
          budget_id: budgetData.id,
          category: cat.category,
          limit_amount: cat.limit_amount,
          icon: cat.icon,
          color: cat.color,
        }));

        const { error: catError } = await supabase
          .from('budget_categories')
          .insert(categoryInserts);

        if (catError) throw catError;
      }

      toast.success(t('budget.updated', 'Budžet ažuriran'));
      await fetchBudgets();
    } catch (error) {
      console.error('Error updating budget:', error);
      toast.error(t('errors.updateBudget', 'Greška pri ažuriranju budžeta'));
    }
  }, [user, isLocalMode, t, fetchBudgets]);

  // Delete budget
  const deleteBudget = useCallback(async (id: string) => {
    if (isLocalMode || !user) return;

    try {
      // Delete categories first
      await supabase
        .from('budget_categories')
        .delete()
        .eq('budget_id', id);

      // Delete members
      await supabase
        .from('budget_members')
        .delete()
        .eq('budget_id', id);

      // Delete budget
      const { error } = await supabase
        .from('budget_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success(t('budget.deleted', 'Budžet obrisan'));
      await fetchBudgets();
    } catch (error) {
      console.error('Error deleting budget:', error);
      toast.error(t('errors.deleteBudget', 'Greška pri brisanju budžeta'));
    }
  }, [user, isLocalMode, t, fetchBudgets]);

  // Reset budget (just refreshes stats since we're calculating from expenses)
  const resetBudget = useCallback(async (id: string) => {
    toast.info(t('budget.resetInfo', 'Statistike se automatski računaju iz transakcija'));
  }, [t]);

  // Generate trend data for the chart
  const trendData = useMemo(() => {
    if (budgets.length === 0) return [];

    const now = new Date();
    const data: { date: string; spent: number; limit: number }[] = [];
    
    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayExpenses = expenses.filter(e => {
        if (e.type !== 'expense') return false;
        if (e.project_id) return false; // Exclude project transactions
        if (e.status && e.status !== 'approved') return false; // Only approved
        const expDate = e.date;
        return expDate >= date && expDate <= dayEnd;
      });

      const daySpent = dayExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalLimit = budgets.reduce((sum, b) => sum + (b.total_amount / 30), 0); // Daily limit approx

      data.push({
        date: date.toLocaleDateString('hr-HR', { weekday: 'short' }),
        spent: daySpent,
        limit: totalLimit,
      });
    }

    return data;
  }, [budgets, expenses]);

  return {
    budgets: budgetsWithStats,
    loading,
    isLocalMode,
    createBudget,
    updateBudget,
    deleteBudget,
    resetBudget,
    refetch: fetchBudgets,
    trendData,
  };
};
