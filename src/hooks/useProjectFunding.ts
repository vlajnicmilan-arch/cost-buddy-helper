import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProjectFunding } from '@/types/project';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const useProjectFunding = (projectId: string | null) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [funding, setFunding] = useState<ProjectFunding[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFunding = useCallback(async () => {
    if (!projectId || !user) {
      setFunding([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch funding with income source details
      const { data, error } = await supabase
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

      if (error) throw error;

      setFunding((data || []).map(f => ({
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
      toast.success(t('projects.fundingAdded'));
      return newFunding;
    } catch (error: any) {
      console.error('Error adding funding:', error);
      if (error.code === '23505') {
        toast.error(t('projects.fundingAlreadyExists'));
      } else {
        toast.error(t('common.error'));
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
      toast.success(t('projects.fundingUpdated'));
    } catch (error) {
      console.error('Error updating funding:', error);
      toast.error(t('common.error'));
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
      toast.success(t('projects.fundingRemoved'));
    } catch (error) {
      console.error('Error deleting funding:', error);
      toast.error(t('common.error'));
    }
  };

  const totalAllocated = funding.reduce((sum, f) => sum + f.allocated_amount, 0);

  return {
    funding,
    loading,
    totalAllocated,
    addFunding,
    updateFunding,
    deleteFunding,
    refetch: fetchFunding
  };
};
