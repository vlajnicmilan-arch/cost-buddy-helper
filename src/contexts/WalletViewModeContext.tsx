import { createContext, useContext, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { useAppState } from '@/contexts/AppStateContext';

/**
 * View mode values:
 *  - 'personal'             → only sources/transactions NOT tied to a company
 *  - `business:<uuid>`      → only sources/transactions tied to that company
 *
 * NOTE: This context is a thin DERIVATION over AppStateContext
 * (`activeBusinessProfileId` + `businessModeEnabled`). It owns no state,
 * no localStorage, so the header BusinessProfileSwitcher and any
 * WalletViewModeChips can never desynchronise.
 */
export type WalletViewMode = 'personal' | `business:${string}`;

const LEGACY_STORAGE_KEY = 'wallet_view_mode';

interface WalletViewModeContextValue {
  mode: WalletViewMode;
  setMode: (m: WalletViewMode) => void;
  /** Convenience: returns the business profile UUID when in a per-company view, else null */
  businessProfileId: string | null;
  isPersonalView: boolean;
  isBusinessView: boolean;
}

const WalletViewModeContext = createContext<WalletViewModeContextValue | undefined>(undefined);

export const WalletViewModeProvider = ({ children }: { children: ReactNode }) => {
  const { activeBusinessProfileId, setActiveBusinessProfileId, businessModeEnabled, setBusinessModeEnabled } = useAppState();

  // One-time cleanup of legacy localStorage key (no longer authoritative).
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch {}
  }, []);

  const mode: WalletViewMode = businessModeEnabled && activeBusinessProfileId
    ? (`business:${activeBusinessProfileId}` as WalletViewMode)
    : 'personal';

  const setMode = useCallback((m: WalletViewMode) => {
    if (m === 'personal') {
      setBusinessModeEnabled(false);
      setActiveBusinessProfileId(null);
    } else if (m.startsWith('business:')) {
      const id = m.slice('business:'.length);
      setActiveBusinessProfileId(id);
      setBusinessModeEnabled(true);
    }
  }, [setActiveBusinessProfileId, setBusinessModeEnabled]);

  const value = useMemo<WalletViewModeContextValue>(() => ({
    mode,
    setMode,
    businessProfileId: mode.startsWith('business:') ? mode.slice('business:'.length) : null,
    isPersonalView: mode === 'personal',
    isBusinessView: mode.startsWith('business:'),
  }), [mode, setMode]);

  return (
    <WalletViewModeContext.Provider value={value}>
      {children}
    </WalletViewModeContext.Provider>
  );
};

export const useWalletViewMode = () => {
  const ctx = useContext(WalletViewModeContext);
  if (!ctx) throw new Error('useWalletViewMode must be used within WalletViewModeProvider');
  return ctx;
};
