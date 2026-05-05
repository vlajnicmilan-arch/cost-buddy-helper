import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';

/**
 * View mode values:
 *  - 'personal'             → only sources/transactions NOT tied to a company
 *  - `business:<uuid>`      → only sources/transactions tied to that company
 *
 * NOTE: This is a DISPLAY-ONLY filter. It must NOT touch
 * AppStateContext.businessModeEnabled / activeBusinessProfileId — those
 * control the entire layout (BusinessModeView vs PersonalModeView) and
 * project isolation. Only the BusinessProfileSwitcher in the header may
 * change those.
 */
export type WalletViewMode = 'personal' | `business:${string}`;

const STORAGE_KEY = 'wallet_view_mode';

interface WalletViewModeContextValue {
  mode: WalletViewMode;
  setMode: (m: WalletViewMode) => void;
  businessProfileId: string | null;
  isPersonalView: boolean;
  isBusinessView: boolean;
}

const isValidMode = (v: string | null): v is WalletViewMode => {
  if (!v) return false;
  return v === 'personal' || v.startsWith('business:');
};

const WalletViewModeContext = createContext<WalletViewModeContextValue | undefined>(undefined);

export const WalletViewModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<WalletViewMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isValidMode(stored)) return stored;
    } catch {}
    return 'personal';
  });

  const setMode = useCallback((m: WalletViewMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('wallet-view-mode-changed', { detail: m }));
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isValidMode(e.newValue)) {
        setModeState(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

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
