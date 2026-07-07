/**
 * useIncomingPayoutAttribution
 *
 * Data hook za AttributionSheet — dohvaća whitelistane podatke o dolaznim
 * payoutima preko `get_my_incoming_payouts` RPC-a (SECURITY DEFINER), i
 * detektira postoji li već pripisan `expenses` red (race guard).
 *
 * Nikad ne čita `project_worker_payouts` direktno — RLS bi blokirala radnika.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface IncomingPayoutRow {
  payout_id: string;
  batch_id: string | null;
  project_id: string;
  project_name: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  paid_amount: number;
  paid_at: string;
  status: string;
  hours_covered: number;
  hourly_rate_snapshot: number;
}

export interface ExistingAttribution {
  id: string;
  amount: number;
  date: string;
  payment_source: string | null;
}

interface State {
  loading: boolean;
  error: string | null;
  payouts: IncomingPayoutRow[];
  /** ako je već pripisano, existing.id vodi na taj expenses red */
  existing: ExistingAttribution | null;
}

export function useIncomingPayoutAttribution(
  payoutIds: string[],
  batchId: string | null,
  isOpen: boolean,
) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    payouts: [],
    existing: null,
  });

  const load = useCallback(async () => {
    if (!user || payoutIds.length === 0) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // 1) Dohvati whitelistane payout info-e (RLS bi inače blokirala radnika).
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc(
        'get_my_incoming_payouts',
        { p_payout_ids: payoutIds },
      );
      if (rpcErr) throw rpcErr;

      // 2) Provjeri postoji li već pripisan expense (race guard vizualizacija).
      //    Batch → provjera preko worker_payout_batch_id, single → preko worker_payout_id.
      let existingQuery = supabase
        .from('expenses')
        .select('id, amount, date, payment_source')
        .eq('user_id', user.id)
        .limit(1);

      if (batchId) {
        existingQuery = existingQuery.eq('worker_payout_batch_id', batchId);
      } else {
        existingQuery = existingQuery.eq('worker_payout_id', payoutIds[0]);
      }

      const { data: existingRows, error: existingErr } = await existingQuery;
      if (existingErr) throw existingErr;

      setState({
        loading: false,
        error: null,
        payouts: (rpcData ?? []) as IncomingPayoutRow[],
        existing:
          existingRows && existingRows.length > 0
            ? {
                id: existingRows[0].id as string,
                amount: Number(existingRows[0].amount),
                date: existingRows[0].date as string,
                payment_source: (existingRows[0].payment_source as string) ?? null,
              }
            : null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ loading: false, error: msg, payouts: [], existing: null });
    }
  }, [user, payoutIds, batchId]);

  useEffect(() => {
    if (!isOpen) return;
    load();
  }, [isOpen, load]);

  return { ...state, refetch: load };
}
