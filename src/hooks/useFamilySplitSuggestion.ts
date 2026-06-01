import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  analyzeFairness,
  type FairnessResult,
  type FamilySplitMode,
  type MemberRow,
  type SnapshotRow,
} from '@/lib/familySplitSuggestion';

interface Args {
  groupId: string | null | undefined;
  currentMode: FamilySplitMode | undefined;
}

/**
 * Učitava zadnje 3 mjesečna snapshota iz `family_split_snapshots` i članove
 * grupe te računa fairness preko `analyzeFairness`. Sve čitanje je RLS-bound
 * (`is_family_member`) — nema RPC-a.
 */
export function useFamilySplitSuggestion({ groupId, currentMode }: Args) {
  const [result, setResult] = useState<FairnessResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!groupId || !currentMode) {
      setResult(null);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const since = new Date();
        since.setMonth(since.getMonth() - 3);
        const sinceIso = since.toISOString().slice(0, 10);

        const [snapRes, memberRes] = await Promise.all([
          supabase
            .from('family_split_snapshots')
            .select(
              'member_user_id, period_start, period_end, shared_total, share_ratio, owed, paid',
            )
            .eq('group_id', groupId)
            .gte('period_start', sinceIso),
          supabase
            .from('family_members')
            .select(
              'user_id, declared_monthly_income, monthly_contribution, income_share_consent',
            )
            .eq('group_id', groupId),
        ]);

        if (cancelled) return;
        if (snapRes.error || memberRes.error) {
          setResult(null);
          return;
        }

        const snaps = (snapRes.data || []) as SnapshotRow[];
        const members = (memberRes.data || []) as MemberRow[];
        setResult(analyzeFairness(snaps, members, currentMode));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId, currentMode]);

  return { result, loading };
}
