import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { CustomIncomeCategory } from '@/types/customIncomeCategory';
import { toast } from 'sonner';

const STORAGE_KEY = 'customIncomeCategories';

export const useCustomIncomeCategories = () => {
  const [customIncomeCategories, setCustomIncomeCategories] = useState<CustomIncomeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { storageMode } = useStorage();

  const isLocalMode = storageMode === 'local' && !user;

  const fetchCustomIncomeCategories = useCallback(async () => {
    // For now, only localStorage is supported (no Supabase table for custom income categories)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setCustomIncomeCategories(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomIncomeCategories();
  }, [fetchCustomIncomeCategories]);

  const addCustomIncomeCategory = async (
    category: Omit<CustomIncomeCategory, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<CustomIncomeCategory | null> => {
    const newCategory: CustomIncomeCategory = {
      ...category,
      id: `custom_income_${crypto.randomUUID()}`,
      user_id: user?.id || 'local',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const updated = [newCategory, ...customIncomeCategories];
    setCustomIncomeCategories(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success('Kategorija prihoda dodana');
    return newCategory;
  };

  const updateCustomIncomeCategory = async (
    id: string, 
    updates: Partial<Omit<CustomIncomeCategory, 'id' | 'user_id' | 'created_at'>>
  ) => {
    const updated = customIncomeCategories.map(cat =>
      cat.id === id ? { ...cat, ...updates, updated_at: new Date().toISOString() } : cat
    );
    setCustomIncomeCategories(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success('Kategorija prihoda ažurirana');
  };

  const deleteCustomIncomeCategory = async (id: string) => {
    const updated = customIncomeCategories.filter(cat => cat.id !== id);
    setCustomIncomeCategories(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success('Kategorija prihoda obrisana');
  };

  return {
    customIncomeCategories,
    loading,
    addCustomIncomeCategory,
    updateCustomIncomeCategory,
    deleteCustomIncomeCategory,
    refetch: fetchCustomIncomeCategories,
  };
};
