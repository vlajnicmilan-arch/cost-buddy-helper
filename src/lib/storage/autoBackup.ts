import { Expense, ReceiptItem } from '@/types/expense';

const BACKUP_STORE = 'auto_backups';
const MAX_BACKUPS = 5; // Keep last 5 backups
const DB_NAME = 'finmate-local';
const DB_VERSION = 2; // Increment version for new store

let db: IDBDatabase | null = null;

export interface AutoBackup {
  id: string;
  createdAt: string;
  expenseCount: number;
  totalAmount: number;
  data: string; // JSON stringified data
}

export const initBackupDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB for backups'));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Expenses store
      if (!database.objectStoreNames.contains('expenses')) {
        const expensesStore = database.createObjectStore('expenses', { keyPath: 'id' });
        expensesStore.createIndex('date', 'date', { unique: false });
        expensesStore.createIndex('type', 'type', { unique: false });
        expensesStore.createIndex('category', 'category', { unique: false });
      }

      // Receipt items store
      if (!database.objectStoreNames.contains('receipt_items')) {
        const itemsStore = database.createObjectStore('receipt_items', { keyPath: 'id' });
        itemsStore.createIndex('expense_id', 'expense_id', { unique: false });
      }

      // Settings store
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }

      // Auto backups store
      if (!database.objectStoreNames.contains(BACKUP_STORE)) {
        const backupStore = database.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
        backupStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

const getDB = async (): Promise<IDBDatabase> => {
  if (!db) {
    await initBackupDB();
  }
  return db!;
};

export const createAutoBackup = async (expenses: Expense[], receiptItems?: ReceiptItem[]): Promise<AutoBackup> => {
  const database = await getDB();

  const backup: AutoBackup = {
    id: `backup-${Date.now()}`,
    createdAt: new Date().toISOString(),
    expenseCount: expenses.length,
    totalAmount: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    data: JSON.stringify({
      version: 1,
      expenses: expenses.map(e => ({
        ...e,
        date: e.date instanceof Date ? e.date.toISOString() : e.date
      })),
      receiptItems: receiptItems || []
    })
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE, 'readwrite');
    const store = transaction.objectStore(BACKUP_STORE);

    // Add new backup
    store.add(backup);

    transaction.oncomplete = async () => {
      // Clean up old backups
      await cleanupOldBackups();
      resolve(backup);
    };

    transaction.onerror = () => reject(transaction.error);
  });
};

export const getAutoBackups = async (): Promise<AutoBackup[]> => {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE, 'readonly');
    const store = transaction.objectStore(BACKUP_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const backups = request.result.sort(
        (a: AutoBackup, b: AutoBackup) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      resolve(backups);
    };

    request.onerror = () => reject(request.error);
  });
};

export const getLatestBackup = async (): Promise<AutoBackup | null> => {
  const backups = await getAutoBackups();
  return backups[0] || null;
};

const cleanupOldBackups = async (): Promise<void> => {
  const database = await getDB();
  const backups = await getAutoBackups();

  if (backups.length <= MAX_BACKUPS) return;

  const toDelete = backups.slice(MAX_BACKUPS);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE, 'readwrite');
    const store = transaction.objectStore(BACKUP_STORE);

    toDelete.forEach(backup => {
      store.delete(backup.id);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const deleteBackup = async (id: string): Promise<void> => {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE, 'readwrite');
    const store = transaction.objectStore(BACKUP_STORE);
    store.delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const restoreFromBackup = async (backup: AutoBackup): Promise<{ expenses: any[]; receiptItems: any[] }> => {
  const data = JSON.parse(backup.data);
  return {
    expenses: data.expenses || [],
    receiptItems: data.receiptItems || []
  };
};

// Backup settings
export interface BackupSettings {
  enabled: boolean;
  intervalMinutes: number;
  lastBackupAt?: string;
}

const DEFAULT_SETTINGS: BackupSettings = {
  enabled: true,
  intervalMinutes: 60 // Every hour
};

export const getBackupSettings = async (): Promise<BackupSettings> => {
  const database = await getDB();

  return new Promise((resolve) => {
    const transaction = database.transaction('settings', 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get('backupSettings');

    request.onsuccess = () => {
      resolve(request.result?.value || DEFAULT_SETTINGS);
    };

    request.onerror = () => {
      resolve(DEFAULT_SETTINGS);
    };
  });
};

export const saveBackupSettings = async (settings: BackupSettings): Promise<void> => {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction('settings', 'readwrite');
    const store = transaction.objectStore('settings');
    store.put({ key: 'backupSettings', value: settings });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};
