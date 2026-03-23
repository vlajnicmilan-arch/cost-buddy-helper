import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { CustomCategory } from '@/types/customCategory';
import { toast } from 'sonner';

export const useCustomCategories = () => {
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { storageMode } = useStorage();

  const isLocalMode = storageMode === 'local' && !user;

  const fetchCustomCategories = useCallback(async () => {
    if (isLocalMode) {
      const stored = localStorage.getItem('customCategories');
      if (stored) {
        setCustomCategories(JSON.parse(stored));
      }
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('custom_categories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomCategories((data || []) as CustomCategory[]);
    } catch (error) {
      console.error('Error fetching custom categories:', error);
      toast.error('Greška pri dohvaćanju prilagođenih kategorija');
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode]);

  useEffect(() => {
    fetchCustomCategories();
  }, [fetchCustomCategories]);

  const addCustomCategory = async (category: Omit<CustomCategory, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (isLocalMode) {
      const newCategory: CustomCategory = {
        ...category,
        id: crypto.randomUUID(),
        user_id: 'local',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const updated = [newCategory, ...customCategories];
      setCustomCategories(updated);
      localStorage.setItem('customCategories', JSON.stringify(updated));
      toast.success('Kategorija dodana');
      return newCategory;
    }

    if (!user) {
      toast.error('Morate biti prijavljeni');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('custom_categories' as any)
        .insert({
          ...category,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      const newCat = data as unknown as CustomCategory;
      setCustomCategories(prev => [newCat, ...prev]);
      toast.success('Kategorija dodana');
      return newCat;
    } catch (error) {
      console.error('Error adding custom category:', error);
      toast.error('Greška pri dodavanju kategorije');
      return null;
    }
  };

  const updateCustomCategory = async (id: string, updates: Partial<Omit<CustomCategory, 'id' | 'user_id' | 'created_at'>>) => {
    if (isLocalMode) {
      const updated = customCategories.map(cat =>
        cat.id === id ? { ...cat, ...updates, updated_at: new Date().toISOString() } : cat
      );
      setCustomCategories(updated);
      localStorage.setItem('customCategories', JSON.stringify(updated));
      toast.success('Kategorija ažurirana');
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_categories' as any)
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setCustomCategories(prev =>
        prev.map(cat => (cat.id === id ? { ...cat, ...updates } : cat))
      );
      toast.success('Kategorija ažurirana');
    } catch (error) {
      console.error('Error updating custom category:', error);
      toast.error('Greška pri ažuriranju kategorije');
    }
  };

  const deleteCustomCategory = async (id: string) => {
    if (isLocalMode) {
      const updated = customCategories.filter(cat => cat.id !== id);
      setCustomCategories(updated);
      localStorage.setItem('customCategories', JSON.stringify(updated));
      toast.success('Kategorija obrisana');
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_categories' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setCustomCategories(prev => prev.filter(cat => cat.id !== id));
      toast.success('Kategorija obrisana');
    } catch (error) {
      console.error('Error deleting custom category:', error);
      toast.error('Greška pri brisanju kategorije');
    }
  };

  return {
    customCategories,
    loading,
    addCustomCategory,
    updateCustomCategory,
    deleteCustomCategory,
    refetch: fetchCustomCategories,
  };
};
