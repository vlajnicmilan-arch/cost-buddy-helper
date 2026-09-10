/**
 * Trajna snimka popisa transakcija (IndexedDB), po korisniku.
 *
 * sessionStorage snimka (`instantCache`) nestaje kad se aplikacija zatvori, pa
 * je svako hladno otvaranje bilo puni mrežni dohvat (10–20 s na velikim
 * računima). Ova snimka preživi zatvaranje i služi SAMO za trenutačni prikaz;
 * puni dohvat i dalje ide u pozadini i tiho zamijeni sadržaj.
 *
 * Zasebna baza (ne `finmate-local`) da se ne dira lokalni način rada niti
 * njegova verzija sheme.
 */

const DB_NAME = 'centar-snapshots';
const DB_VERSION = 1;
const STORE = 'expenses_snapshot';

export interface ExpenseSnapshotRecord {
  user_id: string;
  saved_at: string;
  expenses: unknown[];
}

export interface SnapshotBackend {
  get(userId: string): Promise<ExpenseSnapshotRecord | null>;
  put(record: ExpenseSnapshotRecord): Promise<void>;
  clear(): Promise<void>;
}

let testBackend: SnapshotBackend | null = null;

/** Test-only: zamjena IndexedDB sloja (u testnom okruženju IDB ne postoji). */
export const __setSnapshotBackendForTests = (backend: SnapshotBackend | null): void => {
  testBackend = backend;
};

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('idb open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'user_id' });
      }
    };
  });

const idbBackend: SnapshotBackend = {
  async get(userId) {
    const database = await openDB();
    try {
      return await new Promise<ExpenseSnapshotRecord | null>((resolve, reject) => {
        const req = database.transaction(STORE, 'readonly').objectStore(STORE).get(userId);
        req.onsuccess = () => resolve((req.result as ExpenseSnapshotRecord) ?? null);
        req.onerror = () => reject(req.error ?? new Error('idb get failed'));
      });
    } finally {
      database.close();
    }
  },
  async put(record) {
    const database = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
      });
    } finally {
      database.close();
    }
  },
  async clear() {
    const database = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('idb clear failed'));
      });
    } finally {
      database.close();
    }
  },
};

const backend = (): SnapshotBackend | null => {
  if (testBackend) return testBackend;
  if (typeof indexedDB === 'undefined') return null;
  return idbBackend;
};

/** `date` može doći kao Date (structured clone) ili ISO string. */
export const reviveSnapshotRows = <T extends { date?: unknown }>(rows: unknown[]): T[] =>
  (rows || []).map((row) => {
    const r = row as { date?: unknown };
    const date = r?.date instanceof Date ? r.date : new Date(String(r?.date));
    return { ...(row as object), date } as T;
  });

/** Snimka za TOG korisnika, ili null. Nikad ne baca. */
export async function readExpenseSnapshot<T>(userId: string): Promise<T[] | null> {
  const be = backend();
  if (!be || !userId) return null;
  try {
    const record = await be.get(userId);
    if (!record || record.user_id !== userId) return null;
    if (!Array.isArray(record.expenses) || record.expenses.length === 0) return null;
    return reviveSnapshotRows<T & { date?: unknown }>(record.expenses) as T[];
  } catch {
    return null;
  }
}

/** Zapisuje snimku nakon uspješnog punog dohvata. Nikad ne baca. */
export async function writeExpenseSnapshot(userId: string, expenses: unknown[]): Promise<void> {
  const be = backend();
  if (!be || !userId) return;
  try {
    await be.put({ user_id: userId, saved_at: new Date().toISOString(), expenses });
  } catch {
    /* best-effort */
  }
}

/** Briše sve snimke — pri odjavi i promjeni korisnika. Nikad ne baca. */
export async function clearExpenseSnapshots(): Promise<void> {
  const be = backend();
  if (!be) return;
  try {
    await be.clear();
  } catch {
    /* best-effort */
  }
}
