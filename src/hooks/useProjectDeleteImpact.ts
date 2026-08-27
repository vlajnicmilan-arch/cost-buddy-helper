/**
 * Numbers behind the project delete warning: who is still owed money.
 *
 * Read-only. Deletion behaviour is untouched — this only makes sure the debt
 * towards a person is stated out loud before it disappears from their card
 * (Ljudi and Suradnici never list deleted projects).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  summarizeProjectDeleteImpact,
  type ProjectDeleteImpact,
} from '@/lib/projectDeleteImpact';

export const useProjectDeleteImpact = (projectId: string | null, enabled: boolean) => {
  const [impact, setImpact] = useState<ProjectDeleteImpact | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [engRes, entryRes, payoutRes, collabRes] = await Promise.all([
        supabase.from('project_workers').select('id, hourly_rate').eq('project_id', projectId),
        supabase.from('project_work_entries').select('worker_id, actual_hours').eq('project_id', projectId),
        supabase
          .from('project_worker_payouts')
          .select('worker_id, paid_amount, status, voided_at, deleted_at')
          .eq('project_id', projectId),
        supabase
          .from('project_collaborators')
          .select('id, total_price, paid_amount, status')
          .eq('project_id', projectId),
      ]);

      const engagements = (engRes.data ?? []) as { id: string; hourly_rate: number }[];
      const entries = (entryRes.data ?? []) as { worker_id: string; actual_hours: number }[];
      const payouts = (payoutRes.data ?? []) as {
        worker_id: string;
        paid_amount: number;
        status?: string | null;
        voided_at?: string | null;
        deleted_at?: string | null;
      }[];
      const collaborators = (collabRes.data ?? []) as {
        id: string;
        total_price: number | null;
        paid_amount: number | null;
        status?: string | null;
      }[];

      const hoursBy = new Map<string, number>();
      for (const e of entries) {
        hoursBy.set(e.worker_id, (hoursBy.get(e.worker_id) ?? 0) + (Number(e.actual_hours) || 0));
      }
      const paidBy = new Map<string, number>();
      for (const p of payouts) {
        if (p.deleted_at || p.voided_at || (p.status ?? 'paid') === 'voided') continue;
        paidBy.set(p.worker_id, (paidBy.get(p.worker_id) ?? 0) + (Number(p.paid_amount) || 0));
      }

      setImpact(
        summarizeProjectDeleteImpact(
          engagements.map((e) => ({
            engagementId: e.id,
            earned: (hoursBy.get(e.id) ?? 0) * (Number(e.hourly_rate) || 0),
            paid: paidBy.get(e.id) ?? 0,
          })),
          collaborators.map((c) => ({
            collaboratorId: c.id,
            agreed: Number(c.total_price) || 0,
            paid: Number(c.paid_amount) || 0,
            status: c.status ?? null,
          })),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { impact, loading };
};
