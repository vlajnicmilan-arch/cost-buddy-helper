/**
 * Pending payouts of the signed-in linked worker (get_my_pending_payouts):
 * not confirmed, not reported as not received, not voided, created after
 * the feature went live. Grouped into one item per batch or single payout.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const MY_PENDING_PAYOUTS_KEY = 'worker-pending-payouts';

export interface PendingPayoutRow {
  payout_id: string;
  batch_id: string | null;
  project_id: string;
  project_name: string;
  paid_amount: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
}

export interface PendingPayoutItem {
  key: string;
  batchId: string | null;
  /** All payout ids of the batch (across projects) — what the sheet confirms. */
  payoutIds: string[];
  projectNames: string[];
  /** Amount of the rows in the requested project. */
  amount: number;
  currency: string;
  paidAt: string | null;
}

export function groupPendingPayouts(rows: PendingPayoutRow[], projectId: string): PendingPayoutItem[] {
  const groups = new Map<string, PendingPayoutRow[]>();
  for (const r of rows) {
    const k = r.batch_id ?? r.payout_id;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const items: PendingPayoutItem[] = [];
  for (const [key, list] of groups) {
    const inProject = list.filter((r) => r.project_id === projectId);
    if (inProject.length === 0) continue;
    items.push({
      key,
      batchId: list[0].batch_id,
      payoutIds: list.map((r) => r.payout_id),
      projectNames: Array.from(new Set(list.map((r) => r.project_name))),
      amount: inProject.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
      currency: inProject[0].currency,
      paidAt: inProject[0].paid_at,
    });
  }
  return items;
}

export function useMyPendingPayouts(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [MY_PENDING_PAYOUTS_KEY, user?.id],
    enabled: enabled && !!user,
    queryFn: async (): Promise<PendingPayoutRow[]> => {
      const { data, error } = await supabase.rpc('get_my_pending_payouts');
      if (error) throw error;
      return (data ?? []) as PendingPayoutRow[];
    },
  });
}
