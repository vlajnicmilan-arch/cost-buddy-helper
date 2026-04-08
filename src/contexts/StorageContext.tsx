import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { StorageMode, StorageConfig } from '@/lib/storage/types';

interface StorageContextType {
  storageMode: StorageMode | null;
  isInitialized: boolean;
  setStorageMode: (mode: StorageMode) => void;
  config: StorageConfig | null;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

const STORAGE_CONFIG_KEY = 'finmate-storage-config';

export const StorageProvider = ({ children }: { children: ReactNode }) => {
  const [storageMode, setStorageModeState] = useState<StorageMode | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [config, setConfig] = useState<StorageConfig | null>(null);

  useEffect(() => {
    const loadConfig = () => {
      const savedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (savedConfig) {
        try {
          const parsed: StorageConfig = JSON.parse(savedConfig);
          setConfig(parsed);
          setStorageModeState(parsed.mode);
        } catch (e) {
          console.error('Failed to parse storage config:', e);
        }
      }
      setIsInitialized(true);
    };

    loadConfig();

    // Listen for restored storage mode (e.g. after reinstall with existing session)
    const handleRestore = () => loadConfig();
    window.addEventListener('storage-mode-restored', handleRestore);
    return () => window.removeEventListener('storage-mode-restored', handleRestore);
  }, []);

  const setStorageMode = useCallback((mode: StorageMode) => {
    const newConfig: StorageConfig = {
      mode,
      lastSync: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
    setStorageModeState(mode);
  }, []);

  const contextValue = useMemo(() => ({
    storageMode, isInitialized, setStorageMode, config,
  }), [storageMode, isInitialized, setStorageMode, config]);

  return (
    <StorageContext.Provider value={contextValue}>
      {children}
    </StorageContext.Provider>
  );
};

export const useStorage = () => {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  return context;
};
