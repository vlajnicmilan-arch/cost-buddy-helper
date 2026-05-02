import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

const LOCAL_KEY = 'dashboardHiddenSources';

/**
 * Per-user toggle for hiding payment sources from Dashboard summary/calculations.
 * Hidden sources still exist; their balance and transactions are excluded from
 * Dashboard aggregates only.
 */
export const useHiddenPaymentSources = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { t } = useTranslation();
  const isLocalMode = storageMode === 'local' && !user;

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchHidden = useCallback(async () => {
    if (isLocalMode) {
      try {
        const stored = localStorage.getItem(LOCAL_KEY);
        const parsed = stored ? (JSON.parse(stored) as string[]) : [];
        setHiddenIds(new Set(parsed));
      } catch {
        setHiddenIds(new Set());
      }
      setLoading(false);
      return;
    }
    if (!user) {
      setHiddenIds(new Set());
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('dashboard_hidden_sources' as any)
        .select('source_id')
        .eq('user_id', user.id);
      if (error) throw error;
      setHiddenIds(new Set((data || []).map((r: any) => r.source_id as string)));
    } catch (err) {
      console.error('Error fetching hidden payment sources:', err);
      setHiddenIds(new Set());
    } finally {
      setLoading(false);
    }
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
      setHiddenIds(next);

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
        setHiddenIds(hiddenIds);
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

  const isHidden = useCallback((sourceId: string) => hiddenIds.has(sourceId), [hiddenIds]);

  return {
    hiddenIds,
    isHidden,
    toggleHidden,
    loading,
    refetch: fetchHidden,
  };
};
