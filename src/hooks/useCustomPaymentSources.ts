import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { toast } from 'sonner';

export const useCustomPaymentSources = () => {
  const [customPaymentSources, setCustomPaymentSources] = useState<CustomPaymentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { storageMode } = useStorage();

  const isLocalMode = storageMode === 'local' && !user;

  const fetchCustomPaymentSources = useCallback(async () => {
    if (isLocalMode) {
      const stored = localStorage.getItem('customPaymentSources');
      if (stored) {
        setCustomPaymentSources(JSON.parse(stored));
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
        .from('custom_payment_sources' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomPaymentSources((data || []) as unknown as CustomPaymentSource[]);
    } catch (error) {
      console.error('Error fetching custom payment sources:', error);
      toast.error('Greška pri dohvaćanju prilagođenih izvora plaćanja');
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode]);

  useEffect(() => {
    fetchCustomPaymentSources();
  }, [fetchCustomPaymentSources]);

  const addCustomPaymentSource = async (source: Omit<CustomPaymentSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (isLocalMode) {
      const newSource: CustomPaymentSource = {
        ...source,
        id: crypto.randomUUID(),
        user_id: 'local',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const updated = [newSource, ...customPaymentSources];
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      toast.success('Izvor plaćanja dodan');
      return newSource;
    }

    if (!user) {
      toast.error('Morate biti prijavljeni');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('custom_payment_sources' as any)
        .insert({
          ...source,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      const newSource = data as unknown as CustomPaymentSource;
      setCustomPaymentSources(prev => [newSource, ...prev]);
      toast.success('Izvor plaćanja dodan');
      return newSource;
    } catch (error) {
      console.error('Error adding custom payment source:', error);
      toast.error('Greška pri dodavanju izvora plaćanja');
      return null;
    }
  };

  const updateCustomPaymentSource = async (id: string, updates: Partial<Omit<CustomPaymentSource, 'id' | 'user_id' | 'created_at'>>) => {
    if (isLocalMode) {
      const updated = customPaymentSources.map(src =>
        src.id === id ? { ...src, ...updates, updated_at: new Date().toISOString() } : src
      );
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      toast.success('Izvor plaćanja ažuriran');
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_payment_sources' as any)
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setCustomPaymentSources(prev =>
        prev.map(src => (src.id === id ? { ...src, ...updates } : src))
      );
      toast.success('Izvor plaćanja ažuriran');
    } catch (error) {
      console.error('Error updating custom payment source:', error);
      toast.error('Greška pri ažuriranju izvora plaćanja');
    }
  };

  const deleteCustomPaymentSource = async (id: string) => {
    if (isLocalMode) {
      const updated = customPaymentSources.filter(src => src.id !== id);
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      toast.success('Izvor plaćanja obrisan');
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_payment_sources' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setCustomPaymentSources(prev => prev.filter(src => src.id !== id));
      toast.success('Izvor plaćanja obrisan');
    } catch (error) {
      console.error('Error deleting custom payment source:', error);
      toast.error('Greška pri brisanju izvora plaćanja');
    }
  };

  return {
    customPaymentSources,
    loading,
    addCustomPaymentSource,
    updateCustomPaymentSource,
    deleteCustomPaymentSource,
    refetch: fetchCustomPaymentSources,
  };
};
