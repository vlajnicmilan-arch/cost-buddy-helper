/**
 * LiveDataProvider — one realtime channel per signed-in user.
 *
 * Listens to `custom_payment_sources` (nalog 3) and `krug_settlement_ledger`
 * (nalog 4) on the same channel. An event is only a "dirty" signal; the truth
 * is always the existing server fetch (`useCustomPaymentSources`, Krug
 * TanStack queries). Row data never goes into state; a ledger row's
 * `krug_id` is used only to narrow which Krug queries are invalidated.
 * It also installs the `transactions` batcher marked by `useExpenseFetch`.
 * RLS decides which rows reach this subscriber; no user_id filter is applied.
 *
 * Lifecycle: hidden for 30 s → channel removed; visible/online → channel
 * re-created. The data refresh on resume stays in `useAppResume` (inside
 * `useCustomPaymentSources`), so reconnecting here never fetches twice.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { createRefreshBatcher } from '@/lib/liveData/refreshBatcher';
import { refreshAllWallets, refreshLiveTopic, setLiveDirtyMarker } from '@/lib/liveData/walletsRefreshBus';
import { logChannelState, type ChannelDiagState } from '@/lib/liveData/channelDiagnostics';

export const LIVE_BACKGROUND_DISCONNECT_MS = 30_000;

/** Invalidates Krug settlement state + ledger history; only active (open) queries refetch. */
export async function invalidateKrugSettlement(qc: QueryClient, krugIds: Set<string> | null): Promise<void> {
  const ids: Array<string | undefined> = krugIds ? Array.from(krugIds) : [undefined];
  await Promise.all(
    ids.flatMap((id) => [
      qc.invalidateQueries({ queryKey: id ? ['krug', 'settlement', id] : ['krug', 'settlement'] }),
      qc.invalidateQueries({ queryKey: id ? ['krug', 'ledger', id] : ['krug', 'ledger'] }),
    ]),
  );
}

const readKrugId = (row: unknown): string | null => {
  const id = (row as { krug_id?: unknown } | null | undefined)?.krug_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

interface LiveDataContextValue {
  connected: boolean;
}

const LiveDataContext = createContext<LiveDataContextValue>({ connected: false });

export const useLiveData = () => useContext(LiveDataContext);

export const LiveDataProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const [connected, setConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const outageStartRef = useRef<number | null>(null);
  const forceNextRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const channelName = `live:${userId}`;
    const batcher = createRefreshBatcher({
      run: () => {
        const force = forceNextRef.current;
        forceNextRef.current = false;
        return refreshAllWallets({ force });
      },
    });

    // Pending Krug ids for the next flush; `null` = refresh all open Krugs.
    let krugIds: Set<string> | null = new Set();
    const krugBatcher = createRefreshBatcher({
      run: () => {
        const ids = krugIds;
        krugIds = new Set();
        return invalidateKrugSettlement(queryClient, ids && ids.size > 0 ? ids : null);
      },
    });
    const txBatcher = createRefreshBatcher({
      run: () => refreshLiveTopic('transactions', { force: true }),
    });
    setLiveDirtyMarker('transactions', txBatcher.mark);

    let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const teardown = () => {
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
      setConnected(false);
    };

    const noteFailure = (state: ChannelDiagState, err?: Error) => {
      if (outageStartRef.current === null) outageStartRef.current = Date.now();
      setConnected(false);
      logChannelState({ state, channel: channelName, errorCode: err?.message ?? null });
    };

    const connect = () => {
      if (channelRef.current || !active) return;
      const ch = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'custom_payment_sources' },
          () => {
            // Payload intentionally ignored (DELETE carries only the id).
            forceNextRef.current = true;
            batcher.mark();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'krug_settlement_ledger' },
          (payload) => {
            // Only krug_id is read, to narrow invalidation. DELETE has no krug_id → all.
            const id = readKrugId(payload.new);
            if (id && krugIds) krugIds.add(id);
            else krugIds = null;
            krugBatcher.mark();
          },
        );
      channelRef.current = ch;
      ch.subscribe((status, err) => {
        // Ignore callbacks from a channel we already replaced or removed.
        if (channelRef.current !== ch) return;
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          if (outageStartRef.current !== null) {
            const outageMs = Date.now() - outageStartRef.current;
            outageStartRef.current = null;
            logChannelState({ state: 'RECONNECTED', channel: channelName, outageMs });
            // Catch up on events missed during the outage (reuses a fresh resume fetch).
            batcher.mark();
            krugIds = null;
            krugBatcher.mark();
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          noteFailure(status, err);
        } else if (status === 'CLOSED') {
          noteFailure('CLOSED', err);
          channelRef.current = null;
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (backgroundTimer === null) {
          backgroundTimer = setTimeout(() => {
            backgroundTimer = null;
            teardown();
          }, LIVE_BACKGROUND_DISCONNECT_MS);
        }
      } else {
        if (backgroundTimer !== null) {
          clearTimeout(backgroundTimer);
          backgroundTimer = null;
        }
        connect();
      }
    };
    const onOnline = () => connect();

    connect();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      if (backgroundTimer !== null) clearTimeout(backgroundTimer);
      batcher.dispose();
      krugBatcher.dispose();
      txBatcher.dispose();
      setLiveDirtyMarker('transactions', null);
      outageStartRef.current = null;
      forceNextRef.current = false;
      teardown();
    };
  }, [userId, queryClient]);

  const value = useMemo(() => ({ connected }), [connected]);
  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
};
