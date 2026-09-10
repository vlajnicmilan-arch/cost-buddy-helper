import { describe, it, expect, beforeEach } from 'vitest';
import { planPageRanges, concatPagesInOrder } from '@/lib/expensePages';
import {
  readExpenseSnapshot,
  writeExpenseSnapshot,
  clearExpenseSnapshots,
  __setSnapshotBackendForTests,
  type ExpenseSnapshotRecord,
  type SnapshotBackend,
} from '@/lib/storage/expenseSnapshot';
import {
  markExpensesSource,
  getExpensesSource,
  __resetExpensesSourceForTests,
} from '@/lib/expenseSourceMark';

// ─── in-memory zamjena za IndexedDB ─────────────────────────────────────────
const makeBackend = () => {
  const rows = new Map<string, ExpenseSnapshotRecord>();
  const backend: SnapshotBackend = {
    async get(userId) {
      return rows.get(userId) ?? null;
    },
    async put(record) {
      rows.set(record.user_id, record);
    },
    async clear() {
      rows.clear();
    },
  };
  return { backend, rows };
};

describe('trajna snimka transakcija (IDB sloj)', () => {
  beforeEach(() => __setSnapshotBackendForTests(null));

  it('hidrira spremljenu snimku za istog korisnika i oživljava datume', async () => {
    const { backend } = makeBackend();
    __setSnapshotBackendForTests(backend);

    await writeExpenseSnapshot('u1', [
      { id: 'a', date: new Date('2026-09-01T10:00:00Z'), amount: 10 },
      { id: 'b', date: '2026-08-01T10:00:00Z', amount: 20 },
    ]);

    const snap = await readExpenseSnapshot<{ id: string; date: Date }>('u1');
    expect(snap).toHaveLength(2);
    expect(snap![0].id).toBe('a');
    expect(snap![0].date).toBeInstanceOf(Date);
    expect(snap![1].date.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });

  it('ne vraća snimku drugog korisnika', async () => {
    const { backend } = makeBackend();
    __setSnapshotBackendForTests(backend);
    await writeExpenseSnapshot('u1', [{ id: 'a', date: '2026-09-01T10:00:00Z' }]);
    await expect(readExpenseSnapshot('u2')).resolves.toBeNull();
  });

  it('briše se pri odjavi / promjeni korisnika', async () => {
    const { backend } = makeBackend();
    __setSnapshotBackendForTests(backend);
    await writeExpenseSnapshot('u1', [{ id: 'a', date: '2026-09-01T10:00:00Z' }]);
    await clearExpenseSnapshots();
    await expect(readExpenseSnapshot('u1')).resolves.toBeNull();
  });

  it('greška pohrane ne ruši dohvat', async () => {
    __setSnapshotBackendForTests({
      async get() { throw new Error('boom'); },
      async put() { throw new Error('boom'); },
      async clear() { throw new Error('boom'); },
    });
    await expect(readExpenseSnapshot('u1')).resolves.toBeNull();
    await expect(writeExpenseSnapshot('u1', [{ id: 'a' }])).resolves.toBeUndefined();
  });
});

describe('paralelne stranice', () => {
  it('bez preostalih stranica kad prva nije puna', () => {
    expect(planPageRanges(500, 1000, 500)).toEqual([]);
  });

  it('računa raspone iz ukupnog broja redaka', () => {
    expect(planPageRanges(2140, 1000, 1000)).toEqual([
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
  });

  it('bez count-a pada natrag na sekvencijalno (prazan plan)', () => {
    expect(planPageRanges(null, 1000, 1000)).toEqual([]);
  });

  it('čuva redoslijed pri spajanju', () => {
    const first = [1, 2];
    const rest = [[3, 4], [5, 6]];
    expect(concatPagesInOrder(first, rest)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('expenses_source oznaka', () => {
  beforeEach(() => __resetExpensesSourceForTests());

  it('prvi zapis pobjeđuje', () => {
    markExpensesSource('idb');
    markExpensesSource('network');
    expect(getExpensesSource()).toBe('idb');
  });

  it('prazno dok ništa nije prikazano', () => {
    expect(getExpensesSource()).toBeNull();
  });
});
