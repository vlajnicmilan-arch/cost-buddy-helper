import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showError } from '@/hooks/useStatusFeedback';
import type {
  DecisionAction,
  DecisionActorRole,
  DecisionClosedReason,
  DecisionStatus,
  DecisionStep,
} from '@/lib/projectDecisionStateMachine';

export interface ProjectDecision {
  id: string;
  project_id: string;
  created_by: string;
  title: string;
  initial_description: string;
  initial_price: number | null;
  current_status: DecisionStatus;
  closed_reason: DecisionClosedReason;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  steps: DecisionStep[];
}

interface RawStepRow {
  id: string;
  decision_id: string;
  step_no: number;
  actor_user_id: string;
  actor_role: DecisionActorRole;
  action: DecisionAction;
  message: string | null;
  created_at: string;
}

export function useProjectDecisions(projectId: string | null) {
  const { user } = useAuth();
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!projectId || !user) {
      setDecisions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: decs, error: decErr } = await supabase
        .from('project_decisions' as never)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (decErr) throw decErr;

      const rows = (decs ?? []) as unknown as ProjectDecision[];
      if (rows.length === 0) { setDecisions([]); return; }

      const ids = rows.map((d) => d.id);
      const { data: steps, error: stepErr } = await supabase
        .from('project_decision_steps' as never)
        .select('*')
        .in('decision_id', ids)
        .order('step_no', { ascending: true });
      if (stepErr) throw stepErr;

      const byDecision = new Map<string, DecisionStep[]>();
      ((steps ?? []) as unknown as RawStepRow[]).forEach((s) => {
        const arr = byDecision.get(s.decision_id) ?? [];
        arr.push({
          step_no: s.step_no,
          actor_user_id: s.actor_user_id,
          actor_role: s.actor_role,
          action: s.action,
          message: s.message,
          created_at: s.created_at,
        });
        byDecision.set(s.decision_id, arr);
      });

      setDecisions(rows.map((d) => ({ ...d, steps: byDecision.get(d.id) ?? [] })));
    } catch (e) {
      console.error('[useProjectDecisions] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime — refetch na svaku promjenu koraka/odluka za projekt
  useEffect(() => {
    if (!projectId || !user) return;
    const channel = supabase
      .channel(`project-decisions-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_decisions', filter: `project_id=eq.${projectId}` },
        () => { fetchAll(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_decision_steps' },
        () => { fetchAll(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, user, fetchAll]);

  const createDecision = useCallback(async (input: {
    title: string;
    initial_description: string;
  }): Promise<{ ok: boolean; id?: string }> => {
    if (!projectId || !user) return { ok: false };
    try {
      const { data, error } = await supabase
        .from('project_decisions' as never)
        .insert({
          project_id: projectId,
          created_by: user.id,
          title: input.title.trim(),
          initial_description: input.initial_description.trim(),
        } as never)
        .select('id')
        .single();
      if (error) throw error;

      const decisionId = (data as { id: string }).id;

      // Odmah upiši prvi korak = propose (step_no postavlja trigger)
      const { error: stepErr } = await supabase
        .from('project_decision_steps' as never)
        .insert({
          decision_id: decisionId,
          actor_user_id: user.id,
          actor_role: 'owner', // trigger prisili točnu vrijednost
          action: 'propose',
          message: input.initial_description.trim(),
          step_no: 1, // trigger override-a
        } as never);
      if (stepErr) throw stepErr;

      await fetchAll();
      return { ok: true, id: decisionId };
    } catch (e) {
      console.error('[useProjectDecisions] createDecision', e);
      showError('Neuspješno stvaranje odluke');
      return { ok: false };
    }
  }, [projectId, user, fetchAll]);

  const addStep = useCallback(async (input: {
    decisionId: string;
    action: DecisionAction;
    message?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false };
    try {
      const { error } = await supabase
        .from('project_decision_steps' as never)
        .insert({
          decision_id: input.decisionId,
          actor_user_id: user.id,
          actor_role: 'owner', // trigger prisili
          action: input.action,
          message: input.message?.trim() || null,
          step_no: 999, // trigger override-a
        } as never);
      if (error) throw error;
      await fetchAll();
      return { ok: true };
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'unknown';
      console.error('[useProjectDecisions] addStep', e);
      showError(msg);
      return { ok: false, error: msg };
    }
  }, [user, fetchAll]);

  return { decisions, loading, refetch: fetchAll, createDecision, addStep };
}
