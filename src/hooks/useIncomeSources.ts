import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { IncomeSource } from '@/types/incomeSource';
import { toast } from 'sonner';

// Local storage key for local mode
const LOCAL_INCOME_SOURCES_KEY = 'finmate-income-sources';

export const useIncomeSources = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const isLocalMode = storageMode === 'local' || !user;
  
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIncomeSources = useCallback(async () => {
    setLoading(true);
    try {
      if (isLocalMode) {
        const stored = localStorage.getItem(LOCAL_INCOME_SOURCES_KEY);
        if (stored) {
          setIncomeSources(JSON.parse(stored));
        }
      } else if (user) {
        // Fetch sources user owns
        const { data: ownedSources, error: ownedError } = await supabase
          .from('income_sources')
          .select('*')
          .eq('user_id', user.id);

        if (ownedError) throw ownedError;

        // Fetch sources user is a member of (but not owner)
        const { data: memberships, error: memberError } = await supabase
          .from('income_source_members')
          .select('income_source_id')
          .eq('user_id', user.id)
          .neq('role', 'owner');

        if (memberError) throw memberError;

        let sharedSources: IncomeSource[] = [];
        if (memberships && memberships.length > 0) {
          const sourceIds = memberships.map(m => m.income_source_id);
          const { data: sharedData, error: sharedError } = await supabase
            .from('income_sources')
            .select('*')
            .in('id', sourceIds);

          if (sharedError) throw sharedError;
          sharedSources = sharedData || [];
        }

        // Combine and deduplicate
        const allSources = [...(ownedSources || []), ...sharedSources];
        const uniqueSources = allSources.filter((source, index, self) =>
          index === self.findIndex(s => s.id === source.id)
        );

        // Sort by created_at descending
        uniqueSources.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setIncomeSources(uniqueSources);
      }
    } catch (error) {
      console.error('Error fetching income sources:', error);
      toast.error('Greška pri učitavanju izvora prihoda');
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode]);

  useEffect(() => {
    fetchIncomeSources();
  }, [fetchIncomeSources]);

  const addIncomeSource = async (source: Omit<IncomeSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    try {
      if (isLocalMode) {
        const newSource: IncomeSource = {
          ...source,
          id: crypto.randomUUID(),
          user_id: 'local',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const updated = [newSource, ...incomeSources];
        setIncomeSources(updated);
        localStorage.setItem(LOCAL_INCOME_SOURCES_KEY, JSON.stringify(updated));
        toast.success('Izvor prihoda dodan!');
        return newSource;
      } else if (user) {
        const { data, error } = await supabase
          .from('income_sources')
          .insert({
            ...source,
            user_id: user.id
          })
          .select()
          .single();

        if (error) throw error;
        setIncomeSources(prev => [data, ...prev]);
        toast.success('Izvor prihoda dodan!');
        return data;
      }
    } catch (error) {
      console.error('Error adding income source:', error);
      toast.error('Greška pri dodavanju izvora prihoda');
      throw error;
    }
  };

  const updateIncomeSource = async (source: IncomeSource) => {
    try {
      if (isLocalMode) {
        const updated = incomeSources.map(s => 
          s.id === source.id ? { ...source, updated_at: new Date().toISOString() } : s
        );
        setIncomeSources(updated);
        localStorage.setItem(LOCAL_INCOME_SOURCES_KEY, JSON.stringify(updated));
        toast.success('Izvor prihoda ažuriran!');
      } else {
        const { error } = await supabase
          .from('income_sources')
          .update({
            name: source.name,
            description: source.description,
            icon: source.icon,
            color: source.color
          })
          .eq('id', source.id);

        if (error) throw error;
        setIncomeSources(prev => prev.map(s => s.id === source.id ? source : s));
        toast.success('Izvor prihoda ažuriran!');
      }
    } catch (error) {
      console.error('Error updating income source:', error);
      toast.error('Greška pri ažuriranju izvora prihoda');
      throw error;
    }
  };

  const deleteIncomeSource = async (id: string) => {
    try {
      if (isLocalMode) {
        // First delete associated expenses from localStorage
        const storedExpenses = localStorage.getItem('localExpenses');
        if (storedExpenses) {
          const expenses = JSON.parse(storedExpenses);
          const filteredExpenses = expenses.filter((e: any) => e.income_source_id !== id);
          localStorage.setItem('localExpenses', JSON.stringify(filteredExpenses));
        }
        
        const updated = incomeSources.filter(s => s.id !== id);
        setIncomeSources(updated);
        localStorage.setItem(LOCAL_INCOME_SOURCES_KEY, JSON.stringify(updated));
        toast.success('Izvor prihoda i povezane transakcije obrisani!');
      } else {
        // First delete all expenses linked to this income source
        const { error: expenseError } = await supabase
          .from('expenses')
          .delete()
          .eq('income_source_id', id);

        if (expenseError) {
          console.error('Error deleting linked expenses:', expenseError);
        }

        // Then delete the income source
        const { error } = await supabase
          .from('income_sources')
          .delete()
          .eq('id', id);

        if (error) throw error;
        setIncomeSources(prev => prev.filter(s => s.id !== id));
        toast.success('Izvor prihoda i povezane transakcije obrisani!');
      }
    } catch (error) {
      console.error('Error deleting income source:', error);
      toast.error('Greška pri brisanju izvora prihoda');
      throw error;
    }
  };

  const getIncomeSourceById = (id: string): IncomeSource | undefined => {
    return incomeSources.find(s => s.id === id);
  };

  return {
    incomeSources,
    loading,
    addIncomeSource,
    updateIncomeSource,
    deleteIncomeSource,
    getIncomeSourceById,
    refetch: fetchIncomeSources,
    isLocalMode
  };
};
