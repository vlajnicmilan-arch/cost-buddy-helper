import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useIncomeSourceOwnership = (sourceIds: string[]) => {
  const { user } = useAuth();
  const [ownershipMap, setOwnershipMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const checkOwnership = useCallback(async () => {
    if (!user || sourceIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Check which sources the user owns
      const { data: ownedSources, error: ownedError } = await supabase
        .from('income_sources')
        .select('id')
        .eq('user_id', user.id)
        .in('id', sourceIds);

      if (ownedError) throw ownedError;

      // Also check membership with owner role
      const { data: ownerMemberships, error: memberError } = await supabase
        .from('income_source_members')
        .select('income_source_id')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .in('income_source_id', sourceIds);

      if (memberError) throw memberError;

      // Build ownership map
      const map: Record<string, boolean> = {};
      sourceIds.forEach(id => {
        const isOwner = 
          ownedSources?.some(s => s.id === id) ||
          ownerMemberships?.some(m => m.income_source_id === id);
        map[id] = !!isOwner;
      });

      setOwnershipMap(map);
    } catch (error) {
      console.error('Error checking ownership:', error);
    } finally {
      setLoading(false);
    }
  }, [user, sourceIds.join(',')]);

  useEffect(() => {
    checkOwnership();
  }, [checkOwnership]);

  const isOwner = (sourceId: string): boolean => {
    return ownershipMap[sourceId] ?? false;
  };

  return {
    ownershipMap,
    isOwner,
    loading,
    refetch: checkOwnership
  };
};
