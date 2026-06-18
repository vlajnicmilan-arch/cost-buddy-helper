import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { resolvePaymentSourceKey } from '@/lib/paymentSource/resolve';

const LOCAL_KEY = 'dashboardHiddenSources';
const SESSION_KEY = 'dashboardHiddenSources:cache';

/**
 * Per-user toggle for hiding payment sources from Dashboard summary/calculations.
 * Hidden sources still exist; their balance and transactions are excluded from
 * Dashboard aggregates only.
 *
 * Uses a module-level singleton cache + sessionStorage seed so navigating back
 * to the dashboard does NOT flicker (no "5 → 4 accounts" jump).
 */

// ----- Module-level shared cache -----
let cachedIds: Set<string> | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(s: Set<string>) => void>();

// Synchronous seed from sessionStorage so the very first render is correct
try {
  if (typeof sessionStorage !== 'undefined') {
    const seed = sessionStorage.getItem(SESSION_KEY);
    if (seed) cachedIds = new Set(JSON.parse(seed) as string[]);
  }
} catch {
  /* ignore */
}

const persistSession = (ids: Set<string>) => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]));
    }
  } catch {
    /* ignore */
  }
};

const setCache = (next: Set<string>) => {
  cachedIds = next;
  persistSession(next);
  listeners.forEach(l => l(next));
};

// Clear cache on sign-out so next user does not see previous user's hidden ids
try {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      cachedIds = null;
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
      const empty = new Set<string>();
      listeners.forEach(l => l(empty));
    }
  });
} catch {
  /* ignore */
}

export const useHiddenPaymentSources = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { t } = useTranslation();
  const isLocalMode = storageMode === 'local' && !user;

  // Initialize from cache synchronously — no flicker between navigations
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => cachedIds ?? new Set());
  const [loading, setLoading] = useState(cachedIds === null);

  // Subscribe to cache updates from any other hook instance
  useEffect(() => {
    const listener = (s: Set<string>) => setHiddenIds(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const fetchHidden = useCallback(async () => {
    if (isLocalMode) {
      try {
        const stored = localStorage.getItem(LOCAL_KEY);
        const parsed = stored ? (JSON.parse(stored) as string[]) : [];
        setCache(new Set(parsed));
      } catch {
        setCache(new Set());
      }
      setLoading(false);
      return;
    }
    if (!user) {
      setCache(new Set());
      setLoading(false);
      return;
    }

    // Deduplicate concurrent fetches across all hook instances
    if (inFlight) {
      await inFlight;
      setLoading(false);
      return;
    }

    inFlight = (async () => {
      try {
        const { data, error } = await supabase
          .from('dashboard_hidden_sources' as any)
          .select('source_id')
          .eq('user_id', user.id);
        if (error) throw error;
        setCache(new Set((data || []).map((r: any) => r.source_id as string)));
      } catch (err) {
        console.error('Error fetching hidden payment sources:', err);
        if (cachedIds === null) setCache(new Set());
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
    setLoading(false);
  }, [user, isLocalMode]);

  useEffect(() => {
    fetchHidden();
  }, [fetchHidden]);

  const persistLocal = (next: Set<string>) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(Array.from(next)));
  };

  const toggleHidden = useCallback(
    async (sourceId: string) => {
      const isCurrentlyHidden = hiddenIds.has(sourceId);
      const next = new Set(hiddenIds);
      if (isCurrentlyHidden) next.delete(sourceId);
      else next.add(sourceId);
      // Optimistic propagation across all instances
      setCache(next);

      const emit = () => window.dispatchEvent(new CustomEvent('hidden-payment-sources-changed'));

      if (isLocalMode) {
        persistLocal(next);
        emit();
        showSuccess(
          isCurrentlyHidden
            ? t('paymentSources.shownOnDashboard', 'Prikazano na dashboardu')
            : t('paymentSources.hiddenFromDashboard', 'Sakriveno s dashboarda'),
        );
        return;
      }

      if (!user) return;

      try {
        if (isCurrentlyHidden) {
          const { error } = await supabase
            .from('dashboard_hidden_sources' as any)
            .delete()
            .eq('user_id', user.id)
            .eq('source_id', sourceId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('dashboard_hidden_sources' as any)
            .insert({ user_id: user.id, source_id: sourceId });
          if (error) throw error;
        }
        emit();
        showSuccess(
          isCurrentlyHidden
            ? t('paymentSources.shownOnDashboard', 'Prikazano na dashboardu')
            : t('paymentSources.hiddenFromDashboard', 'Sakriveno s dashboarda'),
        );
      } catch (err) {
        console.error('Error toggling hidden payment source:', err);
        // revert
        setCache(hiddenIds);
        showError(t('errors.update.source', 'Greška pri ažuriranju izvora plaćanja'));
      }
    },
    [hiddenIds, isLocalMode, user, t],
  );

  // Listen for cross-instance updates so multiple consumers stay in sync
  useEffect(() => {
    const handler = () => fetchHidden();
    window.addEventListener('hidden-payment-sources-changed', handler);
    return () => window.removeEventListener('hidden-payment-sources-changed', handler);
  }, [fetchHidden]);

  // Canonical resolver-keyed set so callers can compare against
  // `expense.payment_source` (which is `custom:UUID`) without ad-hoc strips.
  // Stored hidden IDs themselves remain in their original DB shape (raw UUID
  // for custom sources / built-in slug) — that contract is unchanged.
  const hiddenKeysCanonical = useMemo(() => {
    const out = new Set<string>();
    hiddenIds.forEach(id => out.add(resolvePaymentSourceKey(id)));
    return out;
  }, [hiddenIds]);

  const isHidden = useCallback(
    (sourceIdOrPaymentSource: string | null | undefined) => {
      if (!sourceIdOrPaymentSource) return false;
      // Direct raw-id check (for `source.id` lookups from custom sources list)
      if (hiddenIds.has(sourceIdOrPaymentSource)) return true;
      // Canonical-key check (for `expense.payment_source` style inputs)
      return hiddenKeysCanonical.has(resolvePaymentSourceKey(sourceIdOrPaymentSource));
    },
    [hiddenIds, hiddenKeysCanonical],
  );

  return {
    hiddenIds,
    hiddenKeysCanonical,
    isHidden,
    toggleHidden,
    loading,
    refetch: fetchHidden,
  };
};
