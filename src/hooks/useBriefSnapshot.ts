/**
 * BRIEF-VRATA V1 — dohvat snimke uz TVRDI ROK od 400 ms.
 *
 * Fail-open: nema pouzdane snimke unutar roka => `timedOut` => vrata se
 * preskacu i korisnik ulazi u aplikaciju. Hook nikad ne baca.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { instantCache } from '@/lib/instantCache';
import { BRIEF_GATE_CACHE_KEY, BRIEF_GATE_RPC_TIMEOUT_MS } from '@/lib/briefGate';
import type { BriefSnapshot } from '@/lib/brief/types';

export interface UseBriefSnapshotResult {
  snapshot: BriefSnapshot | null;
  /** Tvrdi rok istekao bez ijedne snimke. */
  timedOut: boolean;
}

export function useBriefSnapshot(active: boolean): UseBriefSnapshotResult {
  const seeded = useRef<BriefSnapshot | null>(
    active ? instantCache.read<BriefSnapshot>(BRIEF_GATE_CACHE_KEY) : null,
  );
  const [snapshot, setSnapshot] = useState<BriefSnapshot | null>(seeded.current);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (!cancelled && !seeded.current) setTimedOut(true);
    }, BRIEF_GATE_RPC_TIMEOUT_MS);

    (async () => {
      try {
        const { data, error } = await (supabase as unknown as {
          rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
        }).rpc('brief_gate_snapshot_v2');
        if (cancelled) return;
        if (error || !data || typeof data !== 'object') {
          if (!seeded.current) setTimedOut(true);
          return;
        }
        const next = data as BriefSnapshot;
        instantCache.write(BRIEF_GATE_CACHE_KEY, next);
        setSnapshot(next);
      } catch {
        if (!cancelled && !seeded.current) setTimedOut(true);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active]);

  return { snapshot, timedOut };
}
