/**
 * Kratki ispad poslužitelja ne smije korisniku proizvesti tehničku poruku:
 * dohvat se tiho ponavlja, poruka dolazi tek nakon iscrpljenih pokušaja,
 * a tehnički tekst se u showError zamjenjuje ljudskom rečenicom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logDiagnostic } = vi.hoisted(() => ({ logDiagnostic: vi.fn() }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic }));
vi.mock('@/lib/buildStamp', () => ({ getBuildStamp: () => 'test|assets/index-test.js' }));
vi.mock('@/lib/errorMessages', () => ({
  tr: (_key: string, fallback?: string) => fallback ?? _key,
}));
vi.mock('@/lib/expenseFetchRetry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/expenseFetchRetry')>(
    '@/lib/expenseFetchRetry',
  );
  return {
    ...actual,
    runWithTransientRetry: (fn: any, hooks: any = {}) =>
      actual.runWithTransientRetry(fn, { ...hooks, sleep: async () => {} }),
  };
});

import { loadWithRetry, fetchFailureMessage, NETWORK_FETCH_FALLBACK } from '@/lib/loadWithRetry';
import { isRawTechnicalMessage, RAW_ERROR_REPLACEMENT } from '@/lib/rawErrorGuard';

describe('loadWithRetry — dohvat budžeta', () => {
  beforeEach(() => logDiagnostic.mockClear());

  it('(a) oporavi se nakon jednog "Failed to fetch", bez poruke korisniku', async () => {
    const showError = vi.fn();
    let calls = 0;
    const fetchBudgets = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return ['budget-1'];
    };

    let result: string[] = [];
    try {
      result = await loadWithRetry('budgets', fetchBudgets);
    } catch (e) {
      showError(fetchFailureMessage(e, 'Greška pri učitavanju budžeta'));
    }

    expect(result).toEqual(['budget-1']);
    expect(showError).not.toHaveBeenCalled();
    expect(logDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'budgets_fetch_retried', severity: 'info' }),
    );
  });

  it('(b) nakon 3 neuspjeha javlja hrvatski tekst i piše budgets_fetch_failed', async () => {
    const showError = vi.fn();
    const fetchBudgets = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    try {
      await loadWithRetry('budgets', fetchBudgets);
    } catch (e) {
      showError(fetchFailureMessage(e, 'Greška pri učitavanju budžeta'));
    }

    expect(fetchBudgets).toHaveBeenCalledTimes(3);
    expect(showError).toHaveBeenCalledWith(NETWORK_FETCH_FALLBACK);
    expect(showError.mock.calls[0][0]).not.toMatch(/fetch/i);
    expect(logDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'budgets_fetch_failed', severity: 'error' }),
    );
  });
});

describe('prepoznavanje tehničke poruke', () => {
  it('tehnički tekst i ime iznimke se prepoznaju', () => {
    expect(isRawTechnicalMessage('TypeError: Failed to fetch')).toBe(true);
    expect(isRawTechnicalMessage('NetworkError when attempting to fetch resource')).toBe(true);
    expect(isRawTechnicalMessage('Load failed')).toBe(true);
  });

  it('(d) obična hrvatska poruka prolazi nepromijenjena', () => {
    expect(isRawTechnicalMessage('Greška pri učitavanju budžeta')).toBe(false);
    expect(RAW_ERROR_REPLACEMENT).toContain('Veza s poslužiteljem');
  });
});
