import { useEffect, useRef } from 'react';
import { useWalletViewMode } from '@/contexts/WalletViewModeContext';
import { useAppState } from '@/contexts/AppStateContext';

/**
 * Bi-directional sync between WalletViewMode (chips on dashboard) and
 * AppState.activeBusinessProfileId (used by data hooks like useCustomPaymentSources,
 * useProjects, useRecurringTransactions, useCalendarEvents, ...).
 *
 * - chip "Osobno"        ↔ activeBusinessProfileId = null
 * - chip "business:<id>" ↔ activeBusinessProfileId = <id>
 *
 * Mount once near the root of the dashboard tree.
 */
export const useBusinessViewSync = () => {
  const { mode, setMode, businessProfileId: viewBpId, isPersonalView } = useWalletViewMode();
  const { activeBusinessProfileId, setActiveBusinessProfileId } = useAppState();
  const lastSyncedRef = useRef<{ from: 'mode' | 'app' | null; value: string | null }>({
    from: null,
    value: null,
  });

  // mode → activeBusinessProfileId
  useEffect(() => {
    const target = isPersonalView ? null : viewBpId;
    if (target === activeBusinessProfileId) return;
    lastSyncedRef.current = { from: 'mode', value: target };
    setActiveBusinessProfileId(target);
  }, [mode, isPersonalView, viewBpId, activeBusinessProfileId, setActiveBusinessProfileId]);

  // activeBusinessProfileId → mode (handles legacy switchers that still write to AppState)
  useEffect(() => {
    const desiredMode: typeof mode = activeBusinessProfileId
      ? (`business:${activeBusinessProfileId}` as typeof mode)
      : 'personal';
    if (desiredMode === mode) return;
    // Avoid bouncing back the value we just pushed in the other direction
    if (lastSyncedRef.current.from === 'mode' && lastSyncedRef.current.value === activeBusinessProfileId) return;
    lastSyncedRef.current = { from: 'app', value: activeBusinessProfileId };
    setMode(desiredMode);
  }, [activeBusinessProfileId, mode, setMode]);
};
