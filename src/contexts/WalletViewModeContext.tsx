import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';

export type WalletViewMode = 'all' | 'personal' | 'business';

const STORAGE_KEY = 'wallet_view_mode';

interface WalletViewModeContextValue {
  mode: WalletViewMode;
  setMode: (m: WalletViewMode) => void;
}

const WalletViewModeContext = createContext<WalletViewModeContextValue | undefined>(undefined);

export const WalletViewModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<WalletViewMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as WalletViewMode | null;
      if (stored === 'all' || stored === 'personal' || stored === 'business') return stored;
    } catch {}
    return 'all';
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

  // Sync across tabs / other listeners
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const v = e.newValue as WalletViewMode;
        if (v === 'all' || v === 'personal' || v === 'business') setModeState(v);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

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
