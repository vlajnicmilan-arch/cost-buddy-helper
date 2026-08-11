/**
 * SALDO-MIG PREŽIVLJAVA SKICU.
 *
 * Živi kvar: nakon pada i nastavka skice (Nedovršen pregled → Nastavi →
 * Potvrdi) uvoz je uspio, ali `resolveStatementFallback` nije imao završni
 * saldo izvoda (hint živi samo u memoriji konteksta) → poravnanje se nikad
 * nije ponudilo iako je delta postojala.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveStatementHint,
  loadStatementHint,
  clearStatementHint,
  hydrateStatementHint,
  IMPORT_REVIEW_STATEMENT_HINT_TTL_MS,
} from '../draft';
import { resolveStatementFallback } from '../executor';
import type { ImportReviewPayload } from '../types';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

let storage: MemStorage;
beforeEach(() => { storage = new MemStorage(); });

const payload = (over: Partial<ImportReviewPayload> = {}): ImportReviewPayload => ({
  jobId: 'job-1',
  sourceId: 's1',
  sourceName: 'Erste',
  createdAt: 0,
  rows: [],
  manualCandidates: {},
  importedTransactions: [],
  batchId: 'b1',
  availableTargets: [],
  ...over,
} as ImportReviewPayload);

describe('saldo-mig u trajnoj pohrani', () => {
  it('spremljeni mig se vraća za isti posao', () => {
    saveStatementHint({ jobId: 'job-1', savedAt: Date.now(), closingBalance: 244.85, statementDate: '2026-07-31' }, storage);
    expect(loadStatementHint('job-1', { storage })?.closingBalance).toBe(244.85);
  });

  it('mig drugog posla se ne koristi', () => {
    saveStatementHint({ jobId: 'job-2', savedAt: Date.now(), closingBalance: 10, statementDate: null }, storage);
    expect(loadStatementHint('job-1', { storage })).toBeNull();
  });

  it('istekli mig (>24 h) se odbacuje i briše', () => {
    const old = Date.now() - IMPORT_REVIEW_STATEMENT_HINT_TTL_MS - 1000;
    saveStatementHint({ jobId: 'job-1', savedAt: old, closingBalance: 10, statementDate: null }, storage);
    expect(loadStatementHint('job-1', { storage })).toBeNull();
    expect(loadStatementHint('job-1', { storage })).toBeNull();
  });

  it('nastavak skice: payload bez salda dobije mig → fallback postoji', () => {
    saveStatementHint({ jobId: 'job-1', savedAt: Date.now(), closingBalance: 244.85, statementDate: '2026-07-31' }, storage);
    const p = hydrateStatementHint(payload(), { storage });
    expect(p.statementClosingBalance).toBe(244.85);
    expect(resolveStatementFallback(p)?.closingBalance).toBe(244.85);
  });

  it('payload koji već nosi saldo se NIKAD ne pregazi', () => {
    saveStatementHint({ jobId: 'job-1', savedAt: Date.now(), closingBalance: 1, statementDate: '2026-01-01' }, storage);
    const p = hydrateStatementHint(payload({ statementClosingBalance: 99, statementDate: '2026-07-31' }), { storage });
    expect(p.statementClosingBalance).toBe(99);
    expect(p.statementDate).toBe('2026-07-31');
  });

  it('čišćenje nakon uspješnog uvoza', () => {
    saveStatementHint({ jobId: 'job-1', savedAt: Date.now(), closingBalance: 5, statementDate: null }, storage);
    clearStatementHint(storage);
    expect(loadStatementHint('job-1', { storage })).toBeNull();
  });
});
