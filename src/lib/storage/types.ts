export type StorageMode = 'local' | 'cloud' | 'google-drive' | 'icloud';

export interface StorageConfig {
  mode: StorageMode;
  lastSync?: string;
  cloudProvider?: 'supabase' | 'google-drive' | 'icloud';
}

export interface StorageProvider {
  name: string;
  initialize: () => Promise<void>;
  
  // Expenses
  getExpenses: () => Promise<any[]>;
  saveExpense: (expense: any) => Promise<any>;
  deleteExpense: (id: string) => Promise<void>;
  
  // Receipt Items
  getReceiptItems: (expenseId: string) => Promise<any[]>;
  saveReceiptItems: (expenseId: string, items: any[]) => Promise<void>;
  
  // Sync
  exportData: () => Promise<string>;
  importData: (data: string) => Promise<void>;
}

export const STORAGE_OPTIONS = [
  {
    id: 'local' as StorageMode,
    name: 'Lokalno na uređaju',
    icon: '📱',
    description: 'Podaci ostaju samo na ovom uređaju. Brzo i privatno.',
    available: true
  },
  {
    id: 'cloud' as StorageMode,
    name: 'FinMate Cloud',
    icon: '☁️',
    description: 'Sinkroniziraj između uređaja. Potrebna registracija.',
    available: true
  },
  {
    id: 'google-drive' as StorageMode,
    name: 'Google Drive',
    icon: '🔵',
    description: 'Spremi na svoj Google Drive. Tvoji podaci, tvoja kontrola.',
    available: false, // Will be enabled when OAuth is configured
    comingSoon: true
  },
  {
    id: 'icloud' as StorageMode,
    name: 'iCloud',
    icon: '🍎',
    description: 'Spremi na svoj iCloud. Samo za Apple uređaje.',
    available: false, // Will be enabled when implemented
    comingSoon: true
  }
];
