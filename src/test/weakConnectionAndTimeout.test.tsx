/**
 * ČUVAR — slaba veza.
 *
 * (1) zahtjev koji visi prekida se u roku i pokreće tiho ponavljanje,
 * (2) dohvat novčanika staje nakon 3 pokušaja, bez crvene poruke,
 * (3) tiha traka se pokaže pa sakrije i potiskuje mrežne poruke.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { logDiagnostic } = vi.hoisted(() => ({ logDiagnostic: vi.fn() }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic }));
vi.mock('@/lib/buildStamp', () => ({ getBuildStamp: () => 'test' }));
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

import { withTimeout, FetchTimeoutError, HOME_FETCH_TIMEOUT_MS } from '@/lib/fetchTimeout';
import { classifyFetchFailure } from '@/lib/expenseFetchRetry';
import { loadWithRetry } from '@/lib/loadWithRetry';
import {
  beginWeakFetch,
  endWeakFetch,
  isWeakConnectionActive,
  subscribeWeakConnection,
  __resetWeakConnection,
  getWeakConnectionState,
} from '@/lib/weakConnection';
import { showError, __resetFeedbackDedup, useStatusFeedback } from '@/hooks/useStatusFeedback';

beforeEach(() => {
  logDiagnostic.mockClear();
  __resetWeakConnection();
  __resetFeedbackDedup();
});

describe('rok na dohvat', () => {
  it('rok je razuman (20 s), ne minutama', () => {
    expect(HOME_FETCH_TIMEOUT_MS).toBe(20_000);
  });

  it('zahtjev koji visi prekida se i prijavljuje kao prolazni timeout', async () => {
    let aborted = false;
    const hanging = (signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });

    await expect(withTimeout(hanging, 10)).rejects.toThrow(/aborted/);
    expect(aborted).toBe(true);

    // Poziv koji ne sluša signal svejedno pukne u roku.
    await expect(withTimeout(() => new Promise<never>(() => {}), 10)).rejects.toBeInstanceOf(
      FetchTimeoutError,
    );
    expect(classifyFetchFailure(new FetchTimeoutError(10))).toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });

  it('istek roka pokreće ponovni pokušaj koji uspije', async () => {
    let calls = 0;
    const result = await loadWithRetry(
      'budgets',
      async (signal) => {
        calls += 1;
        if (calls === 1) {
          return new Promise<string[]>((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        return ['ok'];
      },
      { timeoutMs: 10 },
    );
    expect(result).toEqual(['ok']);
    expect(calls).toBe(2);
    expect(isWeakConnectionActive()).toBe(false);
  });
});

describe('dohvat novčanika', () => {
  it('staje nakon 3 pokušaja, bez crvene poruke', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(loadWithRetry('payment_sources', fn, { timeoutMs: 50 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(logDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_sources_fetch_failed', severity: 'error' }),
    );
    expect(isWeakConnectionActive()).toBe(false);
  });

  it('oporavak zapisuje payment_sources_fetch_retried', async () => {
    let calls = 0;
    await loadWithRetry('payment_sources', async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return [];
    });
    expect(logDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_sources_fetch_retried', severity: 'info' }),
    );
  });
});

describe('tiha traka', () => {
  it('pokaže se na prvom ponavljanju i sakrije kad svi dohvati završe', () => {
    const seen: boolean[] = [];
    subscribeWeakConnection((s) => seen.push(s.active));

    beginWeakFetch('budgets');
    expect(isWeakConnectionActive()).toBe(true);
    beginWeakFetch('expenses');
    expect(getWeakConnectionState().pending).toBe(2);

    endWeakFetch('budgets');
    expect(isWeakConnectionActive()).toBe(true);
    endWeakFetch('expenses');
    expect(isWeakConnectionActive()).toBe(false);
    expect(seen).toEqual([true, true, true, false]);
  });

  it('mrežne poruke se potiskuju dok je traka vidljiva', () => {
    const { result } = renderHook(() => useStatusFeedback());

    beginWeakFetch('budgets');
    act(() => showError('Nema veze s poslužiteljem — podaci nisu osvježeni'));
    expect(result.current.visible).toBe(false);

    endWeakFetch('budgets');
    act(() => showError('Nema veze s poslužiteljem — podaci nisu osvježeni'));
    expect(result.current.visible).toBe(true);
  });

  it('poruke koje nisu mrežne prolaze i dok traka traje', () => {
    const { result } = renderHook(() => useStatusFeedback());
    beginWeakFetch('budgets');
    act(() => showError('Greška pri spremanju troška'));
    expect(result.current.visible).toBe(true);
  });
});
