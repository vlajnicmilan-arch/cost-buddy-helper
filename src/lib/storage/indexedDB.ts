import { Expense, Category, PaymentSource, ReceiptItem } from '@/types/expense';

const DB_NAME = 'finmate-local';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

export const initLocalDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve();
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
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
    };
  });
};

const getDB = async (): Promise<IDBDatabase> => {
  if (!db) {
    await initLocalDB();
  }
  return db!;
};

// Generate UUID
const generateId = (): string => {
  return crypto.randomUUID();
};

// Expenses
export const getLocalExpenses = async (): Promise<Expense[]> => {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('expenses', 'readonly');
    const store = transaction.objectStore('expenses');
    const request = store.getAll();

    request.onsuccess = () => {
      const expenses = request.result.map((e: any) => ({
        ...e,
        date: new Date(e.date),
        category: e.category as Category,
        type: e.type as 'expense' | 'income',
        payment_source: (e.payment_source || 'cash') as PaymentSource
      }));
      // Sort by date descending
      expenses.sort((a: Expense, b: Expense) => b.date.getTime() - a.date.getTime());
      resolve(expenses);
    };

    request.onerror = () => reject(request.error);
  });
};

export const saveLocalExpense = async (
  expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<Expense> => {
  const database = await getDB();
  
  const newExpense: Expense = {
    ...expense,
    id: generateId(),
    user_id: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    date: expense.date
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction('expenses', 'readwrite');
    const store = transaction.objectStore('expenses');
    
    // Store with ISO date string for IndexedDB
    const toStore = {
      ...newExpense,
      date: newExpense.date.toISOString()
    };
    
    const request = store.add(toStore);

    request.onsuccess = () => resolve(newExpense);
    request.onerror = () => reject(request.error);
  });
};

export const updateLocalExpense = async (expense: Expense): Promise<Expense> => {
  const database = await getDB();
  
  const updatedExpense: Expense = {
    ...expense,
    updated_at: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction('expenses', 'readwrite');
    const store = transaction.objectStore('expenses');
    
    // Store with ISO date string for IndexedDB
    const toStore = {
      ...updatedExpense,
      date: updatedExpense.date instanceof Date ? updatedExpense.date.toISOString() : updatedExpense.date
    };
    
    const request = store.put(toStore);

    request.onsuccess = () => resolve(updatedExpense);
    request.onerror = () => reject(request.error);
  });
};

export const deleteLocalExpense = async (id: string): Promise<void> => {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['expenses', 'receipt_items'], 'readwrite');
    
    // Delete expense
    const expenseStore = transaction.objectStore('expenses');
    expenseStore.delete(id);
    
    // Delete related receipt items
    const itemsStore = transaction.objectStore('receipt_items');
    const index = itemsStore.index('expense_id');
    const request = index.openCursor(IDBKeyRange.only(id));
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Receipt Items
export const getLocalReceiptItems = async (expenseId: string): Promise<ReceiptItem[]> => {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('receipt_items', 'readonly');
    const store = transaction.objectStore('receipt_items');
    const index = store.index('expense_id');
    const request = index.getAll(expenseId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveLocalReceiptItems = async (
  expenseId: string,
  items: ReceiptItem[]
): Promise<void> => {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('receipt_items', 'readwrite');
    const store = transaction.objectStore('receipt_items');

    items.forEach(item => {
      store.add({
        ...item,
        id: generateId(),
        expense_id: expenseId
      });
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Import/Export for backup
export const exportLocalData = async (): Promise<string> => {
  const database = await getDB();
  
  const expenses = await new Promise<any[]>((resolve, reject) => {
    const transaction = database.transaction('expenses', 'readonly');
    const store = transaction.objectStore('expenses');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const receiptItems = await new Promise<any[]>((resolve, reject) => {
    const transaction = database.transaction('receipt_items', 'readonly');
    const store = transaction.objectStore('receipt_items');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    expenses,
    receiptItems
  }, null, 2);
};

export const importLocalData = async (jsonData: string): Promise<{ expenses: number; items: number }> => {
  const database = await getDB();
  const data = JSON.parse(jsonData);
  
  if (!data.expenses || !Array.isArray(data.expenses)) {
    throw new Error('Invalid data format');
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['expenses', 'receipt_items'], 'readwrite');
    
    const expensesStore = transaction.objectStore('expenses');
    const itemsStore = transaction.objectStore('receipt_items');
    
    let expenseCount = 0;
    let itemCount = 0;

    // Import expenses
    data.expenses.forEach((expense: any) => {
      expensesStore.put(expense);
      expenseCount++;
    });

    // Import receipt items
    if (data.receiptItems && Array.isArray(data.receiptItems)) {
      data.receiptItems.forEach((item: any) => {
        itemsStore.put(item);
        itemCount++;
      });
    }

    transaction.oncomplete = () => resolve({ expenses: expenseCount, items: itemCount });
    transaction.onerror = () => reject(transaction.error);
  });
};

// Clear all local data
export const clearLocalData = async (): Promise<void> => {
  const database = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['expenses', 'receipt_items'], 'readwrite');
    
    transaction.objectStore('expenses').clear();
    transaction.objectStore('receipt_items').clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};