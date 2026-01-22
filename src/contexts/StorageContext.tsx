import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
    // Load storage config from localStorage
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
  }, []);

  const setStorageMode = (mode: StorageMode) => {
    const newConfig: StorageConfig = {
      mode,
      lastSync: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
    setStorageModeState(mode);
  };

  return (
    <StorageContext.Provider value={{ 
      storageMode, 
      isInitialized, 
      setStorageMode,
      config 
    }}>
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
