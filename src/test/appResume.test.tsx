/**
 * ČUVAR — svježina podataka na povratku u fokus.
 *
 * Pokriva: debounce odluku, okidače (focus + online), fail-safe kod pada mreže
 * i logiku ponovne pretplate živog kanala.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { APP_RESUME_MIN_INTERVAL_MS, needsResubscribe, shouldResume } from '@/lib/appResume';
import { useAppResume } from '@/hooks/useAppResume';

const fireVisible = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
const fireHidden = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
const fireOnline = () => window.dispatchEvent(new Event('online'));

describe('shouldResume', () => {
  const base = { now: 1_000_000, lastRunAt: 0 };

  it('dopušta prvi pokušaj', () => {
    expect(shouldResume(base)).toBe(true);
  });

  it('guši lavinu unutar debounce prozora', () => {
    expect(shouldResume({ ...base, lastRunAt: base.now - 1_000 })).toBe(false);
    expect(shouldResume({ ...base, lastRunAt: base.now - APP_RESUME_MIN_INTERVAL_MS - 1 })).toBe(true);
  });

  it('preskače kad je osvježenje već u tijeku ili je hook ugašen', () => {
    expect(shouldResume({ ...base, inFlight: true })).toBe(false);
    expect(shouldResume({ ...base, enabled: false })).toBe(false);
  });
});

describe('needsResubscribe', () => {
  it('živ kanal se ne dira', () => {
    expect(needsResubscribe('joined')).toBe(false);
    expect(needsResubscribe('joining')).toBe(false);
  });
  it('mrtav/nepoznat kanal traži ponovnu pretplatu', () => {
    expect(needsResubscribe('closed')).toBe(true);
    expect(needsResubscribe('errored')).toBe(true);
    expect(needsResubscribe(undefined)).toBe(true);
  });
});

describe('useAppResume', () => {
  it('fokus okida osvježenje, ponovljeni fokus je prigušen', async () => {
    const cb = vi.fn(async () => {});
    renderHook(() => useAppResume(cb));

    await act(async () => { fireVisible(); });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('focus');

    await act(async () => { fireHidden(); fireVisible(); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('povratak mreže isto okida osvježenje', async () => {
    const cb = vi.fn(async () => {});
    renderHook(() => useAppResume(cb));
    await act(async () => { fireOnline(); });
    expect(cb).toHaveBeenCalledWith('online');
  });

  it('pad mreže tijekom osvježenja ništa ne ruši i dopušta idući pokušaj', async () => {
    const cb = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    renderHook(() => useAppResume(cb));

    await act(async () => { fireVisible(); });
    expect(cb).toHaveBeenCalledTimes(1);

    // Neuspjeh ne troši debounce prozor — idući fokus smije pokušati ponovno.
    await act(async () => { fireHidden(); fireVisible(); });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('sinkrona iznimka se guta (bez poruke korisniku)', async () => {
    const cb = vi.fn(() => { throw new Error('boom'); });
    renderHook(() => useAppResume(cb));
    await act(async () => { expect(() => fireVisible()).not.toThrow(); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('ugašen hook ne sluša okidače', async () => {
    const cb = vi.fn();
    renderHook(() => useAppResume(cb, { enabled: false }));
    await act(async () => { fireVisible(); fireOnline(); });
    expect(cb).not.toHaveBeenCalled();
  });

  it('odjavljuje slušače na unmount', async () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useAppResume(cb, { minIntervalMs: 0 }));
    unmount();
    await act(async () => { fireVisible(); fireOnline(); });
    expect(cb).not.toHaveBeenCalled();
  });
});
