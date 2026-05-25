import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProjectMilestone, MilestoneStatus, Project } from '@/types/project';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { PendingRevisionInput } from '@/types/milestoneRevision';
import { notifyProjectActivity } from '@/lib/notifyProjectActivity';
import { applyContractAmendment } from '@/lib/projectCalculations';

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
        is_vtr: !!m.is_vtr,
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
          is_vtr: (milestone as any).is_vtr ?? false,
          actual_start_date: (milestone as any).actual_start_date ?? null,
          actual_end_date: (milestone as any).actual_end_date ?? null,
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
        is_vtr: !!(data as any).is_vtr,
      };

      setMilestones(prev => [...prev, newMilestone].sort((a, b) => a.sort_order - b.sort_order));
      showSuccess(t('projects.milestoneCreated'));
      void notifyProjectActivity({
        project_id: projectId,
        activity_type: 'milestone_added',
        ref_id: newMilestone.id,
        meta: { milestone_name: newMilestone.name },
      });
      return newMilestone;
    } catch (error) {
      console.error('Error adding milestone:', error);
      showError(t('common.error'));
      return null;
    }
  };

  /**
   * Create a VTR (Više traženih radova) — a milestone flagged is_vtr=true that
   * AUTOMATICALLY adds its budget to the project's contract_value and creates a
   * project_contract_amendments record. Mirrors the scope_change amendment flow.
   */
  const createVtr = async (
    input: Omit<ProjectMilestone, 'id' | 'created_at' | 'updated_at' | 'spent' | 'is_vtr' | 'is_contingency'> & { note?: string | null }
  ): Promise<ProjectMilestone | null> => {
    if (!projectId || !user) return null;
    const amount = Number(input.budget) || 0;
    if (amount <= 0) {
      showError(t('projects.vtr.amountRequired', 'Iznos VTR-a mora biti veći od 0.'));
      return null;
    }

    try {
      // 1) Insert milestone with is_vtr=true
      const { data: mData, error: mErr } = await supabase
        .from('project_milestones')
        .insert({
          project_id: projectId,
          name: input.name,
          description: input.description,
          budget: amount,
          status: input.status,
          start_date: input.start_date,
          due_date: input.due_date,
          sort_order: input.sort_order,
          color: input.color || 'hsl(38 92% 50%)',
          depends_on_milestone_id: input.depends_on_milestone_id || null,
          reminder_days_before: input.reminder_days_before ?? 3,
          is_contingency: false,
          is_vtr: true,
        } as any)
        .select()
        .single();
      if (mErr) throw mErr;

      // 2) Insert contract amendment linked to this milestone
      const { error: aErr } = await supabase
        .from('project_contract_amendments' as any)
        .insert({
          project_id: projectId,
          user_id: user.id,
          amendment_amount: amount,
          note: input.note?.trim() || null,
          linked_milestone_id: (mData as any).id,
        } as any);
      if (aErr) {
        console.error('Failed to insert VTR amendment:', aErr);
        showError(t('projects.contractAmendment.saveFailed', 'Nije moguće spremiti aneks ugovora.'));
      } else {
        // 3) Bump projects.contract_value (using same baseline rule as scope_change)
        const { data: projRow } = await supabase
          .from('projects')
          .select('contract_value, total_budget')
          .eq('id', projectId)
          .single();
        if (projRow) {
          const newContract = applyContractAmendment(
            (projRow as any).contract_value,
            (projRow as any).total_budget,
            amount
          );
          await supabase.from('projects').update({ contract_value: newContract }).eq('id', projectId);
          window.dispatchEvent(
            new CustomEvent('contract-amendment-added', { detail: { projectId, amount } })
          );
        }
      }

      const newMilestone: ProjectMilestone = {
        ...(mData as any),
        status: (mData as any).status as MilestoneStatus,
        budget: Number((mData as any).budget) || 0,
        spent: 0,
        is_contingency: false,
        is_vtr: true,
      };
      setMilestones(prev => [...prev, newMilestone].sort((a, b) => a.sort_order - b.sort_order));
      showSuccess(t('projects.vtr.created', 'VTR dodan'));
      void notifyProjectActivity({
        project_id: projectId,
        activity_type: 'milestone_added',
        ref_id: newMilestone.id,
        meta: { milestone_name: newMilestone.name },
      });
      return newMilestone;
    } catch (error) {
      console.error('Error creating VTR:', error);
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
      const previous = milestones.find((m) => m.id === milestone.id);
      const prevStatus = previous?.status;
      const nowIso = new Date().toISOString();
      const todayDate = nowIso.slice(0, 10);

      // --- completed_at semantics (audit timestamp, NEVER overwritten) ---
      // Set on first transition into 'completed'.
      // Clear if transitioning OUT of 'completed'.
      // Otherwise keep previous value (do NOT touch).
      let completedAtUpdate: string | null | undefined;
      if (milestone.status === 'completed' && prevStatus !== 'completed') {
        completedAtUpdate = nowIso;
      } else if (milestone.status !== 'completed' && prevStatus === 'completed') {
        completedAtUpdate = null;
      } else {
        completedAtUpdate = undefined; // don't include in update payload
      }

      // --- actual_end_date: auto-populate on first completion if still empty,
      // never overwrite if user already set it (manual edits always win). ---
      const incomingActualEnd =
        (milestone as any).actual_end_date !== undefined
          ? (milestone as any).actual_end_date
          : previous?.actual_end_date ?? null;
      let actualEndUpdate: string | null = incomingActualEnd;
      if (
        milestone.status === 'completed' &&
        prevStatus !== 'completed' &&
        !incomingActualEnd
      ) {
        actualEndUpdate = todayDate;
      }

      // --- actual_start_date: auto-populate on first transition to in_progress
      // if still empty; otherwise respect user input / preserve. ---
      const incomingActualStart =
        (milestone as any).actual_start_date !== undefined
          ? (milestone as any).actual_start_date
          : previous?.actual_start_date ?? null;
      let actualStartUpdate: string | null = incomingActualStart;
      if (
        milestone.status === 'in_progress' &&
        prevStatus !== 'in_progress' &&
        prevStatus !== 'completed' &&
        !incomingActualStart
      ) {
        actualStartUpdate = todayDate;
      }

      const updatePayload: Record<string, any> = {
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
        actual_start_date: actualStartUpdate,
        actual_end_date: actualEndUpdate,
      };
      if (completedAtUpdate !== undefined) {
        updatePayload.completed_at = completedAtUpdate;
      }

      const { error } = await supabase
        .from('project_milestones')
        .update(updatePayload)
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
        const { data: primaryRev, error: primaryErr } = await supabase
          .from('milestone_budget_revisions' as any)
          .insert({
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
          } as any)
          .select('id')
          .single();

        if (primaryErr) {
          console.error('Failed to insert milestone revision:', primaryErr);
        }

        // Step 3: if scope_change carries a contract amendment, log it and bump project.contract_value
        if (
          revision.amendment &&
          revision.amendment.amount > 0 &&
          revision.change_type === 'scope_change'
        ) {
          const primaryRevId = (primaryRev as any)?.id || null;
          const { error: amendmentErr } = await supabase
            .from('project_contract_amendments' as any)
            .insert({
              project_id: projectId,
              user_id: user.id,
              amendment_amount: revision.amendment.amount,
              note: revision.amendment.note || null,
              linked_revision_id: primaryRevId,
              linked_milestone_id: milestone.id,
            } as any);

          if (amendmentErr) {
            console.error('Failed to insert contract amendment:', amendmentErr);
            showError(
              t(
                'projects.contractAmendment.saveFailed',
                'Nije moguće spremiti aneks ugovora.'
              )
            );
          } else {
            // Bump projects.contract_value by amendment amount
            const { data: projRow, error: projFetchErr } = await supabase
              .from('projects')
              .select('contract_value, total_budget')
              .eq('id', projectId)
              .single();

            if (!projFetchErr && projRow) {
              const newContract = applyContractAmendment(
                (projRow as any).contract_value,
                (projRow as any).total_budget,
                revision.amendment.amount
              );
              const { error: projUpdateErr } = await supabase
                .from('projects')
                .update({ contract_value: newContract })
                .eq('id', projectId);

              if (projUpdateErr) {
                console.error('Failed to bump contract_value:', projUpdateErr);
              } else {
                // Notify any listener (project header / amendments hook) to refetch
                window.dispatchEvent(
                  new CustomEvent('contract-amendment-added', {
                    detail: { projectId, amount: revision.amendment.amount },
                  })
                );
              }
            }
          }
        }
      }

      setMilestones(prev => prev.map(m =>
        m.id === milestone.id
          ? {
              ...milestone,
              budget: Number(milestone.budget),
              actual_start_date: actualStartUpdate,
              actual_end_date: actualEndUpdate,
              completed_at:
                completedAtUpdate !== undefined ? completedAtUpdate : m.completed_at,
            }
          : m
      ));
      showSuccess(t('projects.milestoneUpdated'));
      if (projectId && previous && previous.status !== milestone.status) {
        void notifyProjectActivity({
          project_id: projectId,
          activity_type: 'milestone_status_changed',
          ref_id: milestone.id,
          meta: { milestone_name: milestone.name, status: milestone.status },
        });
      }
    } catch (error) {
      console.error('Error updating milestone:', error);
      showError(t('common.error'));
    }
  };

  const deleteMilestone = async (id: string): Promise<void> => {
    try {
      const removed = milestones.find((m) => m.id === id);

      // VTR: revert contract amendment BEFORE deleting the milestone
      // (FK is ON DELETE SET NULL on linked_milestone_id, so we must find amendments first)
      if (removed?.is_vtr && projectId) {
        const { data: amendments } = await supabase
          .from('project_contract_amendments' as any)
          .select('id, amendment_amount')
          .eq('linked_milestone_id', id);

        const totalRevert = (amendments || []).reduce(
          (sum: number, a: any) => sum + Number(a.amendment_amount || 0),
          0
        );

        if (totalRevert > 0) {
          // Delete amendment rows
          await supabase
            .from('project_contract_amendments' as any)
            .delete()
            .eq('linked_milestone_id', id);

          // Reduce contract_value
          const { data: projRow } = await supabase
            .from('projects')
            .select('contract_value, total_budget')
            .eq('id', projectId)
            .single();
          if (projRow) {
            const newContract = applyContractAmendment(
              (projRow as any).contract_value,
              (projRow as any).total_budget,
              -totalRevert
            );
            await supabase.from('projects').update({ contract_value: newContract }).eq('id', projectId);
            window.dispatchEvent(
              new CustomEvent('contract-amendment-added', { detail: { projectId, amount: -totalRevert } })
            );
          }
        }
      }

      const { error } = await supabase
        .from('project_milestones')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMilestones(prev => prev.filter(m => m.id !== id));
      showSuccess(t('projects.milestoneDeleted'));
      if (projectId) {
        void notifyProjectActivity({
          project_id: projectId,
          activity_type: 'milestone_deleted',
          ref_id: id,
          meta: { milestone_name: removed?.name },
        });
      }
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
    createVtr,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
    refetch: fetchMilestones
  };
};
