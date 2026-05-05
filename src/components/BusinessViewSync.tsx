import { useEffect } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { useWalletViewMode } from '@/contexts/WalletViewModeContext';

/**
 * Keeps WalletViewMode (used by /dashboard, /wallet, /reports, GlobalSearch)
 * in sync with the header's BusinessProfileSwitcher (activeBusinessProfileId
 * + businessModeEnabled in AppState). One source of truth for the user.
 */
export const BusinessViewSync = () => {
  const { activeBusinessProfileId, businessModeEnabled } = useAppState();
  const { setMode, mode } = useWalletViewMode();

  useEffect(() => {
    const target = businessModeEnabled && activeBusinessProfileId
      ? (`business:${activeBusinessProfileId}` as const)
      : ('personal' as const);
    if (mode !== target) setMode(target);
  }, [activeBusinessProfileId, businessModeEnabled, mode, setMode]);

  return null;
};
