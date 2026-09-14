/**
 * Prozor svježine: druga instanca hooka unutar prozora ne radi mrežni dohvat.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EXPENSES_FRESH_WINDOW_MS,
  isExpensesFresh,
  markExpensesFetched,
  __resetExpensesFreshnessForTests,
} from '@/lib/expensesFreshness';

const SOURCE = readFileSync('src/hooks/useExpenseFetch.ts', 'utf8');
const USER = 'd4d31ee6-5f6b-4059-8c87-b595b394f56b';

describe('expensesFreshness', () => {
  beforeEach(() => __resetExpensesFreshnessForTests());

  it('bez zabilježenog dohvata nije svjež', () => {
    expect(isExpensesFresh(USER)).toBe(false);
  });

  it('unutar prozora je svjež, izvan prozora nije', () => {
    const t0 = 1_000_000;
    markExpensesFetched(USER, t0);
    expect(isExpensesFresh(USER, t0 + EXPENSES_FRESH_WINDOW_MS - 1)).toBe(true);
    expect(isExpensesFresh(USER, t0 + EXPENSES_FRESH_WINDOW_MS)).toBe(false);
  });

  it('svježina je po korisniku', () => {
    markExpensesFetched(USER, 1_000_000);
    expect(isExpensesFresh('drugi-korisnik', 1_000_001)).toBe(false);
  });

  it('bez korisnika nikad nije svjež', () => {
    expect(isExpensesFresh(null)).toBe(false);
  });
});

describe('useExpenseFetch koristi prozor samo u početnom efektu', () => {
  it('potpuni dohvat bilježi svježinu', () => {
    expect(SOURCE).toContain('markExpensesFetched(user.id)');
  });

  it('početni efekt preskače mrežu dok je dohvat svjež', () => {
    expect(SOURCE).toMatch(/if \(!isLocalMode && isExpensesFresh\(userId\)\) \{[\s\S]{0,80}return;/);
  });

  it('refetch, povratak u fokus i realtime ne provjeravaju svježinu', () => {
    const gateCount = (SOURCE.match(/isExpensesFresh\(/g) || []).length;
    expect(gateCount).toBe(1);
  });
});
