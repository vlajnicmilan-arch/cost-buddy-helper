import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  GUIDED_EXPENSE_THRESHOLD,
  getGuidedHomeStatus,
  shouldAutoExitGuided,
  type GuidedHomeStatus,
} from '@/lib/guidedMode';
import { logFunnelEvent } from '@/lib/funnelTracking';

const CACHE_KEY_PREFIX = 'guided_home_exited_at:';

interface UseGuidedModeResult {
  status: GuidedHomeStatus;
  /** `true` = znamo server stanje (ili imamo cache). `false` = inicijalni boot prije prvog fetcha. */
  ready: boolean;
  /** ISO string ili `null` ako još nije izašao. */
  guidedHomeExitedAt: string | null;
  /** Auto-exit po thresholdu. Idempotentno na serveru. */
  exit: (reason?: 'threshold_reached') => Promise<void>;
}

/**
 * Source of truth: `profiles.guided_home_exited_at` (server).
 * `localStorage` je samo read-through cache za prvi render. Server uvijek pobjeđuje.
 *
 * Auto-exit: kad `expenseCount >= GUIDED_EXPENSE_THRESHOLD`, hook poziva
 * RPC `mark_guided_home_exited()` jednom. RPC je idempotentan.
 */
export function useGuidedMode(expenseCount: number): UseGuidedModeResult {
  const { user } = useAuth();
  const [exitedAt, setExitedAt] = useState<string | null>(() => {
    if (!user?.id) return null;
    try {
      const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${user.id}`);
      return cached || null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);
  const autoExitFiredRef = useRef(false);
  const enteredFiredRef = useRef(false);

  // Server fetch — pri mountu i na user promjeni.
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('guided_home_exited_at')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        const serverValue = (data?.guided_home_exited_at as string | null) ?? null;
        setExitedAt(serverValue);
        try {
          if (serverValue) {
            localStorage.setItem(`${CACHE_KEY_PREFIX}${user.id}`, serverValue);
          } else {
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${user.id}`);
          }
        } catch { /* noop */ }
      } catch {
        // Mreža je pala — ostavi cache vrijednost, kasniji refetch će je ispraviti.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const status = getGuidedHomeStatus({ guidedHomeExitedAt: exitedAt, expenseCount });

  // Telemetrija: ulazak u guided (jednom po mountu).
  useEffect(() => {
    if (!ready || enteredFiredRef.current) return;
    if (status === 'guided' || status === 'zero_data') {
      enteredFiredRef.current = true;
      logFunnelEvent('guided_home_entered', {
        substate: status,
        expense_count: expenseCount,
      }).catch(() => {});
    }
  }, [ready, status, expenseCount]);

  const exit = useCallback(
    async (reason: 'threshold_reached' = 'threshold_reached') => {
      if (!user?.id) return;
      if (exitedAt) return; // idempotentno na klijentu
      try {
        const { data, error } = await supabase.rpc('mark_guided_home_exited');
        if (error) throw error;
        const ts = (data as string | null) ?? new Date().toISOString();
        setExitedAt(ts);
        try {
          localStorage.setItem(`${CACHE_KEY_PREFIX}${user.id}`, ts);
        } catch { /* noop */ }
        logFunnelEvent('guided_home_exited', {
          reason,
          expense_count: expenseCount,
        }).catch(() => {});
      } catch (err) {
        console.warn('[useGuidedMode] exit failed', err);
      }
    },
    [user?.id, exitedAt, expenseCount],
  );

  // Auto-exit kad korisnik dosegne prag.
  useEffect(() => {
    if (!ready || autoExitFiredRef.current) return;
    if (shouldAutoExitGuided({ guidedHomeExitedAt: exitedAt, expenseCount })) {
      autoExitFiredRef.current = true;
      exit('threshold_reached');
    }
  }, [ready, exitedAt, expenseCount, exit]);

  return { status, ready, guidedHomeExitedAt: exitedAt, exit };
}
