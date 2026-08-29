import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert }) },
}));

import {
  logLandingClick,
  flushLandingTelemetryOnExit,
  armLandingExitFlush,
  __resetLandingTelemetry,
  FIRST_FLUSH_DELAY_MS,
  FLUSH_DELAY_MS,
} from '@/lib/landingTelemetry';

const click = (target = 'a') =>
  logLandingClick({ eventType: 'cta_click', target, href: '/x' });

describe('landing telemetry flushing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    insert.mockClear();
    sessionStorage.clear();
    localStorage.clear();
    __resetLandingTelemetry();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends the first batch without waiting the full 2500 ms', async () => {
    click();
    await vi.advanceTimersByTimeAsync(FIRST_FLUSH_DELAY_MS);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('keeps the longer delay for later batches', async () => {
    click();
    await vi.advanceTimersByTimeAsync(FIRST_FLUSH_DELAY_MS);
    insert.mockClear();
    click('b');
    await vi.advanceTimersByTimeAsync(FIRST_FLUSH_DELAY_MS);
    expect(insert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('flushes buffered rows on exit via keepalive fetch', () => {
    click();
    flushLandingTelemetryOnExit();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = (fetch as any).mock.calls[0];
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toHaveLength(1);
  });

  it('does not send the same rows twice when both exit triggers fire', () => {
    click();
    flushLandingTelemetryOnExit();
    flushLandingTelemetryOnExit();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('re-arms after returning to visible but never resends old rows', () => {
    click();
    flushLandingTelemetryOnExit();
    armLandingExitFlush();
    flushLandingTelemetryOnExit();
    expect(fetch).toHaveBeenCalledTimes(1);
    click('c');
    armLandingExitFlush();
    flushLandingTelemetryOnExit();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetch as any).mock.calls[1][1].body)).toHaveLength(1);
  });

  it('drops rows when the exit send fails (no requeue, no retry)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    click();
    flushLandingTelemetryOnExit();
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS * 2);
    expect(insert).not.toHaveBeenCalled();
    armLandingExitFlush();
    flushLandingTelemetryOnExit();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('landing session id scope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    insert.mockClear();
    sessionStorage.clear();
    localStorage.clear();
    __resetLandingTelemetry();
  });
  afterEach(() => vi.useRealTimers());

  const flushAndRead = async () => {
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + FIRST_FLUSH_DELAY_MS);
    const rows = insert.mock.calls.at(-1)![0];
    return rows[0].session_id as string;
  };

  it('is stable within one tab and lives in sessionStorage', async () => {
    click();
    const a = await flushAndRead();
    click('b');
    const b = await flushAndRead();
    expect(a).toBe(b);
    expect(sessionStorage.getItem('funnel_session_id')).toBe(a);
    expect(localStorage.getItem('funnel_session_id')).toBeNull();
  });

  it('differs in a new tab (fresh sessionStorage)', async () => {
    click();
    const a = await flushAndRead();
    sessionStorage.clear();
    __resetLandingTelemetry();
    click('b');
    const b = await flushAndRead();
    expect(b).not.toBe(a);
  });
});
