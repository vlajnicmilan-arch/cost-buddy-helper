import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PredictedShare {
  user_id: string;
  display_name: string | null;
  ratio: number;       // 0..1
  share: number;       // amount * ratio
}

export interface SplitPrediction {
  groupId: string;
  groupName: string;
  mode: 'equal' | 'proportional_income' | 'manual';
  shares: PredictedShare[];
}

/**
 * Real-time predictor for split impact when a transaction is being created
 * on a shared family payment source. Returns null when the source is not
 * shared, otherwise breaks the given amount into per-member shares based on
 * the group's split_mode + income ratios.
 *
 * No expense override is considered (this is the *baseline* before override).
 */
export function useFamilySplitPrediction(
  paymentSource: string | null | undefined,
  amount: number,
) {
  const [prediction, setPrediction] = useState<SplitPrediction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (!paymentSource || !paymentSource.startsWith('custom:')) {
        setPrediction(null);
        return;
      }
      const sourceId = paymentSource.slice(7);
      setLoading(true);

      try {
        const { data: shared } = await supabase
          .from('family_shared_sources')
          .select('group_id, family_groups!inner(id, name, split_mode)')
          .eq('payment_source_id', sourceId)
          .maybeSingle();

        if (!shared || cancelled) {
          setPrediction(null);
          return;
        }

        const groupId = (shared as any).group_id as string;
        const groupName = (shared as any).family_groups?.name ?? '';
        const mode =
          ((shared as any).family_groups?.split_mode as
            | 'equal'
            | 'proportional_income'
            | 'manual') ?? 'equal';

        const { data: ratios } = await supabase.rpc(
          'compute_family_income_ratio',
          { p_group_id: groupId },
        );

        const memberIds = (ratios ?? []).map((r: any) => r.user_id as string);
        let profiles: any[] = [];
        if (memberIds.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', memberIds);
          profiles = profs ?? [];
        }

        const memberCount = memberIds.length || 1;
        const shares: PredictedShare[] = (ratios ?? []).map((r: any) => {
          const ratio =
            mode === 'proportional_income'
              ? Number(r.ratio ?? 0)
              : 1 / memberCount; // equal + manual fallback = equal
          const display =
            profiles.find((p) => p.user_id === r.user_id)?.display_name ?? null;
          return {
            user_id: r.user_id,
            display_name: display,
            ratio,
            share: amount * ratio,
          };
        });

        if (!cancelled) {
          setPrediction({ groupId, groupName, mode, shares });
        }
      } catch {
        if (!cancelled) setPrediction(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
    // re-run when source changes; amount changes recompute locally below
  }, [paymentSource]);

  // Recompute shares locally when amount changes (no extra fetch)
  const withAmount: SplitPrediction | null = prediction
    ? {
        ...prediction,
        shares: prediction.shares.map((s) => ({
          ...s,
          share: amount * s.ratio,
        })),
      }
    : null;

  return { prediction: withAmount, loading };
}
