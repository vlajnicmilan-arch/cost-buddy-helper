/**
 * BRIEF-VRATA V1 — dohvat snimke uz TVRDI ROK od 400 ms.
 *
 * Fail-open: nema pouzdane snimke unutar roka => `timedOut` => vrata se
 * preskacu i korisnik ulazi u aplikaciju. Hook nikad ne baca.
 *
 * Sjeme iz predmemorije vrijedi samo unutar granice svjezine
 * (BRIEF_GATE_CACHE_MAX_AGE_MS); starije se tretira kao da ga nema.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { instantCache } from '@/lib/instantCache';
import {
  BRIEF_GATE_CACHE_KEY,
  BRIEF_GATE_CACHE_MAX_AGE_MS,
  BRIEF_GATE_RPC_TIMEOUT_MS,
} from '@/lib/briefGate';
import type { BriefSnapshot } from '@/lib/brief/types';

export interface UseBriefSnapshotResult {
  snapshot: BriefSnapshot | null;
  /** Tvrdi rok istekao bez ijedne snimke. */
  timedOut: boolean;
}

/** Omotnica sa zigom vremena — instantCache nema vlastiti zig. */
interface CachedBriefSnapshot {
  cachedAt: number;
  snapshot: BriefSnapshot;
}

function readFreshSeed(now: number): BriefSnapshot | null {
  const cached = instantCache.read<CachedBriefSnapshot>(BRIEF_GATE_CACHE_KEY);
  if (!cached || typeof cached !== 'object') return null;
  const cachedAt =
    cached.cachedAt instanceof Date ? cached.cachedAt.getTime() : Number(cached.cachedAt);
  if (!Number.isFinite(cachedAt)) return null;
  if (now - cachedAt > BRIEF_GATE_CACHE_MAX_AGE_MS) return null;
  const snapshot = cached.snapshot;
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

export function useBriefSnapshot(active: boolean): UseBriefSnapshotResult {
  const seeded = useRef<BriefSnapshot | null>(active ? readFreshSeed(Date.now()) : null);
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
        // Zakasnjeli odgovor uvijek osvjezava predmemoriju za SLJEDECI put;
        // je li smije promijeniti ekran odlucuje potrosac (zamrzavanje).
        instantCache.write<CachedBriefSnapshot>(BRIEF_GATE_CACHE_KEY, {
          cachedAt: Date.now(),
          snapshot: next,
        });
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
