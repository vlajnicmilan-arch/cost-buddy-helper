import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProjectMilestone, MilestoneStatus, Project } from '@/types/project';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { PendingRevisionInput } from '@/types/milestoneRevision';

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

      setMilestones((data || []).map((m: any) => ({
        ...m,
        status: m.status as MilestoneStatus,
        budget: Number(m.budget) || 0,
        spent: spentByMilestone.get(m.id) || 0,
        depends_on_milestone_id: m.depends_on_milestone_id || null,
        reminder_days_before: m.reminder_days_before ?? 3,
        is_contingency: !!m.is_contingency,
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
          sort_order: milestone.sort_order,
          color: milestone.color || '#3b82f6',
          depends_on_milestone_id: milestone.depends_on_milestone_id || null,
          reminder_days_before: milestone.reminder_days_before ?? 3,
          is_contingency: milestone.is_contingency ?? false,
        } as any)
        .select()
        .single();

      if (error) throw error;

      const newMilestone: ProjectMilestone = {
        ...data,
        status: data.status as MilestoneStatus,
        budget: Number(data.budget) || 0,
        spent: 0,
        is_contingency: !!(data as any).is_contingency,
      };

      setMilestones(prev => [...prev, newMilestone].sort((a, b) => a.sort_order - b.sort_order));
      showSuccess(t('projects.milestoneCreated'));
      return newMilestone;
    } catch (error) {
      console.error('Error adding milestone:', error);
      showError(t('common.error'));
      return null;
    }
  };

  const updateMilestone = async (
    milestone: ProjectMilestone,
    revision?: PendingRevisionInput,
    previousBudget?: number
  ): Promise<void> => {
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
          sort_order: milestone.sort_order,
          color: milestone.color || '#3b82f6',
          depends_on_milestone_id: milestone.depends_on_milestone_id || null,
          reminder_days_before: milestone.reminder_days_before ?? 3,
        })
        .eq('id', milestone.id);

      if (error) throw error;

      // If a budget revision was attached, persist the audit trail and balance siblings
      if (revision && previousBudget !== undefined && user && projectId) {
        const newBudget = Number(milestone.budget) || 0;
        const delta = newBudget - previousBudget;
        let linkedRevisionId: string | null = null;

        // Step 1: balance the source (transfer or contingency) BEFORE inserting our revision
        if (delta > 0 && (revision.coverage === 'transfer' || revision.coverage === 'contingency')) {
          const sourceId =
            revision.coverage === 'transfer'
              ? revision.linked_milestone_id
              : milestones.find((m) => m.is_contingency)?.id || null;

          if (sourceId) {
            const sourceMilestone = milestones.find((m) => m.id === sourceId);
            if (sourceMilestone) {
              const sourceOldBudget = Number(sourceMilestone.budget) || 0;
              const sourceNewBudget = Math.max(0, sourceOldBudget - delta);

              const { error: sourceUpdateErr } = await supabase
                .from('project_milestones')
                .update({ budget: sourceNewBudget })
                .eq('id', sourceId);

              if (!sourceUpdateErr) {
                // Insert linked counter-revision on the source
                const { data: linkedRev, error: linkedErr } = await supabase
                  .from('milestone_budget_revisions' as any)
                  .insert({
                    milestone_id: sourceId,
                    project_id: projectId,
                    user_id: user.id,
                    previous_amount: sourceOldBudget,
                    new_amount: sourceNewBudget,
                    reason: t('projects.revisions.linkedReason', 'Sredstva prebačena na fazu „{{name}}“', { name: milestone.name }),
                    change_type: revision.change_type,
                    coverage: revision.coverage,
                    linked_milestone_id: milestone.id,
                  } as any)
                  .select('id')
                  .single();

                if (!linkedErr && linkedRev) {
                  linkedRevisionId = (linkedRev as any).id;
                }

                // Reflect the source change locally
                setMilestones((prev) =>
                  prev.map((m) => (m.id === sourceId ? { ...m, budget: sourceNewBudget } : m))
                );
              }
            }
          }
        }

        // Step 2: insert the primary revision for the edited milestone
        await supabase.from('milestone_budget_revisions' as any).insert({
          milestone_id: milestone.id,
          project_id: projectId,
          user_id: user.id,
          previous_amount: previousBudget,
          new_amount: newBudget,
          reason: revision.reason,
          change_type: revision.change_type,
          coverage: revision.coverage,
          linked_milestone_id:
            revision.coverage === 'transfer' ? revision.linked_milestone_id : null,
          linked_revision_id: linkedRevisionId,
        } as any);
      }

      setMilestones(prev => prev.map(m => 
        m.id === milestone.id ? { ...milestone, budget: Number(milestone.budget) } : m
      ));
      showSuccess(t('projects.milestoneUpdated'));
    } catch (error) {
      console.error('Error updating milestone:', error);
      showError(t('common.error'));
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
      showSuccess(t('projects.milestoneDeleted'));
    } catch (error) {
      console.error('Error deleting milestone:', error);
      showError(t('common.error'));
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
      showError(t('common.error'));
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
