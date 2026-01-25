import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProjectMilestone, MilestoneStatus } from '@/types/project';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const useProjectMilestones = (projectId: string | null) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMilestones = useCallback(async () => {
    if (!projectId || !user) {
      setMilestones([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_milestones')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Fetch spent amounts per milestone
      const { data: expenses } = await supabase
        .from('expenses')
        .select('milestone_id, amount')
        .eq('project_id', projectId)
        .not('milestone_id', 'is', null);

      const spentByMilestone = new Map<string, number>();
      expenses?.forEach(e => {
        if (e.milestone_id) {
          spentByMilestone.set(
            e.milestone_id, 
            (spentByMilestone.get(e.milestone_id) || 0) + Number(e.amount)
          );
        }
      });

      setMilestones((data || []).map(m => ({
        ...m,
        status: m.status as MilestoneStatus,
        budget: Number(m.budget) || 0,
        spent: spentByMilestone.get(m.id) || 0
      })));
    } catch (error) {
      console.error('Error fetching milestones:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const addMilestone = async (
    milestone: Omit<ProjectMilestone, 'id' | 'created_at' | 'updated_at' | 'spent'>
  ): Promise<ProjectMilestone | null> => {
    if (!projectId || !user) return null;

    try {
      const { data, error } = await supabase
        .from('project_milestones')
        .insert({
          project_id: projectId,
          name: milestone.name,
          description: milestone.description,
          budget: milestone.budget,
          status: milestone.status,
          start_date: milestone.start_date,
          due_date: milestone.due_date,
          sort_order: milestone.sort_order
        })
        .select()
        .single();

      if (error) throw error;

      const newMilestone: ProjectMilestone = {
        ...data,
        status: data.status as MilestoneStatus,
        budget: Number(data.budget) || 0,
        spent: 0
      };

      setMilestones(prev => [...prev, newMilestone].sort((a, b) => a.sort_order - b.sort_order));
      toast.success(t('projects.milestoneCreated'));
      return newMilestone;
    } catch (error) {
      console.error('Error adding milestone:', error);
      toast.error(t('common.error'));
      return null;
    }
  };

  const updateMilestone = async (milestone: ProjectMilestone): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_milestones')
        .update({
          name: milestone.name,
          description: milestone.description,
          budget: milestone.budget,
          status: milestone.status,
          start_date: milestone.start_date,
          due_date: milestone.due_date,
          completed_at: milestone.status === 'completed' ? new Date().toISOString() : null,
          sort_order: milestone.sort_order
        })
        .eq('id', milestone.id);

      if (error) throw error;

      setMilestones(prev => prev.map(m => 
        m.id === milestone.id ? { ...milestone, budget: Number(milestone.budget) } : m
      ));
      toast.success(t('projects.milestoneUpdated'));
    } catch (error) {
      console.error('Error updating milestone:', error);
      toast.error(t('common.error'));
    }
  };

  const deleteMilestone = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('project_milestones')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMilestones(prev => prev.filter(m => m.id !== id));
      toast.success(t('projects.milestoneDeleted'));
    } catch (error) {
      console.error('Error deleting milestone:', error);
      toast.error(t('common.error'));
    }
  };

  const reorderMilestones = async (reorderedMilestones: ProjectMilestone[]): Promise<void> => {
    try {
      const updates = reorderedMilestones.map((m, index) => ({
        id: m.id,
        sort_order: index
      }));

      for (const update of updates) {
        await supabase
          .from('project_milestones')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }

      setMilestones(reorderedMilestones.map((m, index) => ({ ...m, sort_order: index })));
    } catch (error) {
      console.error('Error reordering milestones:', error);
      toast.error(t('common.error'));
    }
  };

  return {
    milestones,
    loading,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
    refetch: fetchMilestones
  };
};
