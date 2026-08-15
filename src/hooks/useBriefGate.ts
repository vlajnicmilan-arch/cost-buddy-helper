/**
 * useBriefGate — snimka istina za Brief-vrata.
 *
 * Trenutnost + fail-open:
 *  - render iz instantCache snimke ODMAH (0 ms, sinkrono na mountu),
 *  - RPC `brief_gate_snapshot()` revalidira u pozadini,
 *  - ako snimke nema i RPC ne stigne unutar 400 ms => `giveUp` (preskoči vrata).
 *
 * Hook nikad ne baca; svaka greška je `giveUp`.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { instantCache } from '@/lib/instantCache';
import { hasResumableReview } from '@/lib/importReview/draft';
import {
  BRIEF_GATE_CACHE_KEY,
  BRIEF_GATE_RPC_TIMEOUT_MS,
  type BriefGateSnapshot,
} from '@/lib/briefGate';

export interface UseBriefGateResult {
  snapshot: BriefGateSnapshot | null;
  hasImportDraft: boolean;
  /** Tvrdi rok istekao bez ijedne snimke => vrata se preskaču. */
  giveUp: boolean;
}

export function useBriefGate(active: boolean): UseBriefGateResult {
  const seeded = useRef<BriefGateSnapshot | null>(
    active ? instantCache.read<BriefGateSnapshot>(BRIEF_GATE_CACHE_KEY) : null,
  );
  const [snapshot, setSnapshot] = useState<BriefGateSnapshot | null>(seeded.current);
  const [giveUp, setGiveUp] = useState(false);
  const hasImportDraft = useRef<boolean>(active ? safeHasDraft() : false).current;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (!cancelled && !seeded.current) setGiveUp(true);
    }, BRIEF_GATE_RPC_TIMEOUT_MS);

    (async () => {
      try {
        const { data, error } = await (supabase as unknown as {
          rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
        }).rpc('brief_gate_snapshot');
        if (cancelled) return;
        if (error || !data || typeof data !== 'object') {
          if (!seeded.current) setGiveUp(true);
          return;
        }
        const next = data as BriefGateSnapshot;
        instantCache.write(BRIEF_GATE_CACHE_KEY, next);
        setSnapshot(next);
      } catch {
        if (!cancelled && !seeded.current) setGiveUp(true);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active]);

  return { snapshot, hasImportDraft, giveUp };
}

function safeHasDraft(): boolean {
  try {
    return hasResumableReview();
  } catch {
    return false;
  }
}
