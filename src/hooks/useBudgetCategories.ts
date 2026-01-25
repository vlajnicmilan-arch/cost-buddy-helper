import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BudgetCategory } from '@/types/budget';
import { toast } from 'sonner';

export const useBudgetCategories = (budgetId: string | null) => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!budgetId || !user) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_categories')
        .select('*')
        .eq('budget_id', budgetId)
        .order('limit_amount', { ascending: false });

      if (error) throw error;

      setCategories((data || []).map(c => ({
        ...c,
        limit_amount: Number(c.limit_amount)
      })));
    } catch (error) {
      console.error('Error fetching budget categories:', error);
    } finally {
      setLoading(false);
    }
  }, [budgetId, user]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const addCategory = async (categoryData: Omit<BudgetCategory, 'id' | 'created_at' | 'updated_at'>) => {
    if (!budgetId) return;

    try {
      const { error } = await supabase
        .from('budget_categories')
        .insert(categoryData);

      if (error) throw error;

      toast.success('Kategorija dodana');
      await fetchCategories();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('Ova kategorija već postoji u budžetu');
      } else {
        console.error('Error adding category:', error);
        toast.error('Greška pri dodavanju kategorije');
      }
    }
  };

  const updateCategory = async (category: BudgetCategory) => {
    try {
      const { error } = await supabase
        .from('budget_categories')
        .update({
          limit_amount: category.limit_amount,
          icon: category.icon,
          color: category.color
        })
        .eq('id', category.id);

      if (error) throw error;

      toast.success('Kategorija ažurirana');
      await fetchCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Greška pri ažuriranju kategorije');
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const { error } = await supabase
        .from('budget_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Kategorija uklonjena');
      await fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Greška pri uklanjanju kategorije');
    }
  };

  return {
    categories,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories
  };
};
