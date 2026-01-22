import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SourceMemberStats {
  [sourceId: string]: {
    memberCount: number;
    pendingCount: number;
  };
}

export const useIncomeSourceStats = (sourceIds: string[]) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<SourceMemberStats>({});
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!user || sourceIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Initialize stats for all sources
      const newStats: SourceMemberStats = {};
      sourceIds.forEach(id => {
        newStats[id] = { memberCount: 0, pendingCount: 0 };
      });

      // Fetch member counts
      const { data: membersData, error: membersError } = await supabase
        .from('income_source_members')
        .select('income_source_id')
        .in('income_source_id', sourceIds);

      if (!membersError && membersData) {
        membersData.forEach(m => {
          if (newStats[m.income_source_id]) {
            newStats[m.income_source_id].memberCount++;
          }
        });
      }

      // Fetch pending transaction counts
      const { data: pendingData, error: pendingError } = await supabase
        .from('expenses')
        .select('income_source_id')
        .in('income_source_id', sourceIds)
        .eq('status', 'pending');

      if (!pendingError && pendingData) {
        pendingData.forEach(p => {
          if (p.income_source_id && newStats[p.income_source_id]) {
            newStats[p.income_source_id].pendingCount++;
          }
        });
      }

      setStats(newStats);
    } catch (error) {
      console.error('Error fetching source stats:', error);
    } finally {
      setLoading(false);
    }
  }, [user, sourceIds.join(',')]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    refetch: fetchStats
  };
};
