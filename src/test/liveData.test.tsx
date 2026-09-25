/**
 * Živa salda — nalog 3: shared live listener for custom_payment_sources.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const qc = new QueryClient();
const wrap = (ui: ReactElement) => <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
const render = (ui: ReactElement) => {
  const r = rtlRender(wrap(ui));
  return { ...r, rerender: (next: ReactElement) => r.rerender(wrap(next)) };
};
import { createRefreshBatcher } from '@/lib/liveData/refreshBatcher';
import {
  registerWalletsRefresher,
  __resetWalletsRefreshersForTests,
} from '@/lib/liveData/walletsRefreshBus';

type SubCb = (status: string, err?: Error) => void;
interface FakeChannel {
  name: string;
  handler: ((payload: unknown) => void) | null;
  filter: Record<string, unknown> | null;
  subCb: SubCb | null;
  removed: boolean;
  on: (type: string, filter: Record<string, unknown>, h: (p: unknown) => void) => FakeChannel;
  subscribe: (cb: SubCb) => FakeChannel;
}

const rt = vi.hoisted(() => ({
  channels: [] as unknown[],
  userId: 'u1' as string | null,
  logs: [] as Array<{ event: string; details?: Record<string, unknown> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (name: string) => {
      const ch: FakeChannel = {
        name,
        handler: null,
        filter: null,
        subCb: null,
        removed: false,
        on(_t, filter, h) {
          if (!this.handler) {
            this.filter = filter;
            this.handler = h;
          }
          return this;
        },
        subscribe(cb) {
          this.subCb = cb;
          return this;
        },
      };
      rt.channels.push(ch);
      return ch;
    },
    removeChannel: async (ch: FakeChannel) => {
      ch.removed = true;
      ch.subCb?.('CLOSED');
      return 'ok';
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: rt.userId ? { id: rt.userId } : null, authReady: true }),
}));

vi.mock('@/lib/diagnosticLogger', () => ({
  logDiagnostic: (row: { event: string; details?: Record<string, unknown> }) => rt.logs.push(row),
}));

import { LiveDataProvider, LIVE_BACKGROUND_DISCONNECT_MS } from '@/contexts/LiveDataContext';
import { __resetChannelDiagThrottleForTests } from '@/lib/liveData/channelDiagnostics';

const channels = () => rt.channels as FakeChannel[];
const open = () => channels().filter((c) => !c.removed);

const setVisibility = (v: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  rt.channels.length = 0;
  rt.logs.length = 0;
  rt.userId = 'u1';
  __resetWalletsRefreshersForTests();
  __resetChannelDiagThrottleForTests();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('refreshBatcher', () => {
  it('coalesces events in a 400 ms window into one refresh', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const b = createRefreshBatcher({ run });
    b.mark();
    await vi.advanceTimersByTimeAsync(100);
    b.mark();
    b.mark();
    await vi.advanceTimersByTimeAsync(399);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never waits longer than 1500 ms from the first event', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const b = createRefreshBatcher({ run });
    for (let t = 0; t < 1500; t += 100) {
      b.mark();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a burst of 200 events yields at most 2 refreshes', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const b = createRefreshBatcher({ run });
    for (let i = 0; i < 200; i++) {
      b.mark();
      await vi.advanceTimersByTimeAsync(10);
    }
    await vi.advanceTimersByTimeAsync(2000);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(run.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('events during a running refresh give exactly one follow-up, never parallel', async () => {
    let resolve: () => void = () => {};
    let concurrent = 0;
    let maxConcurrent = 0;
    const run = vi.fn(
      () =>
        new Promise<void>((r) => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          resolve = () => {
            concurrent--;
            r();
          };
        }),
    );
    const b = createRefreshBatcher({ run });
    b.mark();
    await vi.advanceTimersByTimeAsync(400);
    expect(run).toHaveBeenCalledTimes(1);
    b.mark();
    b.mark();
    b.mark();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(run).toHaveBeenCalledTimes(2);
    await act(async () => resolve());
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
  });
});

describe('LiveDataProvider', () => {
  it('opens one channel on custom_payment_sources without a user_id filter', () => {
    render(<LiveDataProvider><div /></LiveDataProvider>);
    expect(open()).toHaveLength(1);
    expect(open()[0].name).toBe('live:u1');
    expect(open()[0].filter).toEqual({ event: '*', schema: 'public', table: 'custom_payment_sources' });
  });

  it('DELETE triggers a forced refresh without reading the payload', async () => {
    const refresher = vi.fn().mockResolvedValue(undefined);
    registerWalletsRefresher(refresher);
    render(<LiveDataProvider><div /></LiveDataProvider>);
    const payload = new Proxy(
      { eventType: 'DELETE' },
      {
        get: (_t, key) => {
          throw new Error(`payload read: ${String(key)}`);
        },
      },
    );
    act(() => open()[0].handler?.(payload));
    await vi.advanceTimersByTimeAsync(400);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(refresher).toHaveBeenCalledWith({ force: true });
  });

  it('disconnects after 30 s in background and reconnects on return without extra fetch', async () => {
    const refresher = vi.fn().mockResolvedValue(undefined);
    registerWalletsRefresher(refresher);
    render(<LiveDataProvider><div /></LiveDataProvider>);
    act(() => open()[0].subCb?.('SUBSCRIBED'));

    act(() => setVisibility('hidden'));
    await vi.advanceTimersByTimeAsync(LIVE_BACKGROUND_DISCONNECT_MS - 1);
    expect(open()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(open()).toHaveLength(0);

    act(() => setVisibility('visible'));
    expect(open()).toHaveLength(1);
    expect(channels()).toHaveLength(2);
    act(() => open()[0].subCb?.('SUBSCRIBED'));
    await vi.advanceTimersByTimeAsync(2000);
    // The single full refresh on resume belongs to useAppResume in the hook.
    expect(refresher).not.toHaveBeenCalled();
    // Intentional background disconnect is not a diagnostic event.
    expect(rt.logs).toHaveLength(0);
  });

  it('short background (< 30 s) keeps the same channel', async () => {
    render(<LiveDataProvider><div /></LiveDataProvider>);
    act(() => setVisibility('hidden'));
    await vi.advanceTimersByTimeAsync(10_000);
    act(() => setVisibility('visible'));
    await vi.advanceTimersByTimeAsync(LIVE_BACKGROUND_DISCONNECT_MS);
    expect(channels()).toHaveLength(1);
    expect(open()).toHaveLength(1);
  });

  it('diagnostics: first success silent, errors throttled 60 s, reconnect logged once with catch-up', async () => {
    const refresher = vi.fn().mockResolvedValue(undefined);
    registerWalletsRefresher(refresher);
    render(<LiveDataProvider><div /></LiveDataProvider>);
    const ch = open()[0];
    act(() => ch.subCb?.('SUBSCRIBED'));
    expect(rt.logs).toHaveLength(0);

    act(() => ch.subCb?.('CHANNEL_ERROR', new Error('boom')));
    act(() => ch.subCb?.('CHANNEL_ERROR', new Error('boom')));
    expect(rt.logs).toHaveLength(1);
    expect(rt.logs[0].event).toBe('realtime_channel_state');
    expect(rt.logs[0].details).toMatchObject({ status: 'CHANNEL_ERROR', error_code: 'boom' });
    expect(rt.logs[0].details?.build_stamp).toBeTruthy();

    await vi.advanceTimersByTimeAsync(5000);
    act(() => ch.subCb?.('SUBSCRIBED'));
    expect(rt.logs).toHaveLength(2);
    expect(rt.logs[1].details).toMatchObject({ status: 'RECONNECTED' });
    expect(rt.logs[1].details?.outage_ms).toBeGreaterThanOrEqual(5000);
    await vi.advanceTimersByTimeAsync(400);
    expect(refresher).toHaveBeenCalledWith({ force: false });

    await vi.advanceTimersByTimeAsync(61_000);
    act(() => ch.subCb?.('CHANNEL_ERROR', new Error('boom')));
    expect(rt.logs).toHaveLength(3);
  });

  it('sign-out closes the channel; a new user gets a fresh channel without leaking the old', () => {
    const { rerender } = render(<LiveDataProvider><div /></LiveDataProvider>);
    expect(open().map((c) => c.name)).toEqual(['live:u1']);
    rt.userId = null;
    rerender(<LiveDataProvider><div /></LiveDataProvider>);
    expect(open()).toHaveLength(0);
    rt.userId = 'u2';
    rerender(<LiveDataProvider><div /></LiveDataProvider>);
    expect(open().map((c) => c.name)).toEqual(['live:u2']);
    expect(rt.logs).toHaveLength(0);
  });
});
