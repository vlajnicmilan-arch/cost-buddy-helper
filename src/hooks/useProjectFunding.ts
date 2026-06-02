import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProjectFunding } from '@/types/project';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export interface ProjectIncomeSource {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
}

// Best-effort daily digest enqueue for participant project space.
// Recipient-type independent — RPC excludes the actor itself.
async function enqueueFundingDigest(
  projectId: string,
  actorUserId: string,
  kind: 'project_funding_added' | 'project_funding_updated' | 'project_funding_removed',
  label: string | null,
  refId: string | null,
) {
  try {
    await supabase.rpc('enqueue_participant_digest_event', {
      p_project_id: projectId,
      p_actor_user_id: actorUserId,
      p_event: {
        kind,
        label,
        ref_id: refId,
        at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[useProjectFunding] digest enqueue error', err);
  }
}

export const useProjectFunding = (projectId: string | null) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [funding, setFunding] = useState<ProjectFunding[]>([]);
  const [incomeSources, setIncomeSources] = useState<ProjectIncomeSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFunding = useCallback(async () => {
    if (!projectId || !user) {
      setFunding([]);
      setIncomeSources([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch funding with income source details (from project_funding table)
      const { data: fundingData, error: fundingError } = await supabase
        .from('project_funding')
        .select(`
          *,
          income_sources (
            name,
            icon,
            color
          )
        `)
        .eq('project_id', projectId);

      if (fundingError) {
        console.error('Error fetching project_funding:', fundingError);
      }

      setFunding((fundingData || []).map(f => ({
        id: f.id,
        project_id: f.project_id,
        income_source_id: f.income_source_id,
        allocated_amount: Number(f.allocated_amount) || 0,
        percentage: f.percentage ? Number(f.percentage) : null,
        created_at: f.created_at,
        updated_at: f.updated_at,
        income_source_name: (f.income_sources as any)?.name,
        income_source_icon: (f.income_sources as any)?.icon,
        income_source_color: (f.income_sources as any)?.color
      })));

      // Also fetch income transactions linked to this project (type = 'income')
      const { data: incomeData, error: incomeError } = await supabase
        .from('expenses')
        .select('id, description, amount, date, category')
        .eq('project_id', projectId)
        .eq('type', 'income')
        .eq('status', 'approved');

      if (incomeError) {
        console.error('Error fetching project income:', incomeError);
      }

      setIncomeSources((incomeData || []).map(inc => ({
        id: inc.id,
        description: inc.description,
        amount: Number(inc.amount) || 0,
        date: inc.date,
        category: inc.category
      })));

    } catch (error) {
      console.error('Error fetching project funding:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchFunding();
  }, [fetchFunding]);

  const addFunding = async (
    incomeSourceId: string,
    allocatedAmount: number,
    percentage?: number
  ): Promise<ProjectFunding | null> => {
    if (!projectId || !user) return null;

    try {
      const { data, error } = await supabase
        .from('project_funding')
        .insert({
          project_id: projectId,
          income_source_id: incomeSourceId,
          allocated_amount: allocatedAmount,
          percentage: percentage || null
        })
        .select(`
          *,
          income_sources (
            name,
            icon,
            color
          )
        `)
        .single();

      if (error) throw error;

      const newFunding: ProjectFunding = {
        id: data.id,
        project_id: data.project_id,
        income_source_id: data.income_source_id,
        allocated_amount: Number(data.allocated_amount) || 0,
        percentage: data.percentage ? Number(data.percentage) : null,
        created_at: data.created_at,
        updated_at: data.updated_at,
        income_source_name: (data.income_sources as any)?.name,
        income_source_icon: (data.income_sources as any)?.icon,
        income_source_color: (data.income_sources as any)?.color
      };

      setFunding(prev => [...prev, newFunding]);
      showSuccess(t('projects.fundingAdded'));
      void enqueueFundingDigest(
        projectId,
        user.id,
        'project_funding_added',
        newFunding.income_source_name ?? null,
        newFunding.id,
      );
      return newFunding;
    } catch (error: any) {
      console.error('Error adding funding:', error);
      if (error.code === '23505') {
        showError(t('projects.fundingAlreadyExists'));
      } else {
        showError(t('common.error'));
      }
      return null;
    }
  };

  const updateFunding = async (
    id: string,
    allocatedAmount: number,
    percentage?: number
  ): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_funding')
        .update({
          allocated_amount: allocatedAmount,
          percentage: percentage || null
        })
        .eq('id', id);

      if (error) throw error;

      setFunding(prev => prev.map(f => 
        f.id === id 
          ? { ...f, allocated_amount: allocatedAmount, percentage: percentage || null } 
          : f
      ));
      showSuccess(t('projects.fundingUpdated'));
    } catch (error) {
      console.error('Error updating funding:', error);
      showError(t('common.error'));
    }
  };

  const deleteFunding = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_funding')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setFunding(prev => prev.filter(f => f.id !== id));
      showSuccess(t('projects.fundingRemoved'));
    } catch (error) {
      console.error('Error deleting funding:', error);
      showError(t('common.error'));
    }
  };

  // Total allocated from project_funding table
  const totalAllocatedFromFunding = funding.reduce((sum, f) => sum + f.allocated_amount, 0);
  
  // Total income from project income transactions
  const totalIncomeFromTransactions = incomeSources.reduce((sum, inc) => sum + inc.amount, 0);
  
  // Combined total
  const totalAllocated = totalAllocatedFromFunding + totalIncomeFromTransactions;

  // Total sources count (funding entries + income transactions)
  const totalSourcesCount = funding.length + incomeSources.length;

  return {
    funding,
    incomeSources,
    loading,
    totalAllocated,
    totalSourcesCount,
    addFunding,
    updateFunding,
    deleteFunding,
    refetch: fetchFunding
  };
};
