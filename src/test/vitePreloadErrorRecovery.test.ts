import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sentry')>();
  return {
    ...actual,
    initSentry: vi.fn(),
  };
});

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(() => 'event-id'),
  flush: vi.fn(() => Promise.resolve(true)),
}));

const createMockWindow = (opts: { storageThrows?: boolean } = {}) => {
  const listeners: Record<string, EventListener[]> = {};
  const storage: Record<string, string> = {};

  const sessionStorage = opts.storageThrows
    ? {
        getItem: vi.fn(() => {
          throw new Error('denied');
        }),
        setItem: vi.fn(() => {
          throw new Error('denied');
        }),
        removeItem: vi.fn(() => {
          throw new Error('denied');
        }),
      }
    : {
        getItem: vi.fn((k: string) => storage[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          storage[k] = v;
        }),
        removeItem: vi.fn((k: string) => {
          delete storage[k];
        }),
      };

  return {
    addEventListener: vi.fn((name: string, fn: EventListener) => {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      const fns = listeners[event.type] || [];
      fns.forEach((fn) => fn(event));
      return true;
    }),
    location: {
      href: 'https://vmbalance.com/projekti',
      reload: vi.fn(),
    },
    sessionStorage,
  } as unknown as Window & typeof globalThis;
};

const preloadEvent = (payload?: unknown) => {
  const event = new Event('vite:preloadError', { cancelable: true });
  if (payload !== undefined) (event as any).payload = payload;
  return event;
};

describe('registerVitePreloadErrorRecovery', () => {
  let registerVitePreloadErrorRecovery: typeof import('@/main').registerVitePreloadErrorRecovery;

  beforeEach(async () => {
    vi.clearAllMocks();
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }

    (globalThis as any).IntersectionObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    };

    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    const mod = await import('@/main');
    registerVitePreloadErrorRecovery = mod.registerVitePreloadErrorRecovery;
  });

  afterEach(() => {
    delete (globalThis as any).IntersectionObserver;
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('prevents default, logs to Sentry with the failed file, and reloads', async () => {
    const win = createMockWindow();
    registerVitePreloadErrorRecovery(win);

    const event = preloadEvent(
      new Error('Unable to preload CSS for /assets/ProjektiLanding-AqD-Fu5l.css')
    );
    win.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledOnce(), { timeout: 15000 });

    const { initSentry } = await import('@/lib/sentry');
    const { captureMessage, flush } = await import('@sentry/react');

    expect(initSentry).toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      'Stale preload asset after deploy',
      expect.objectContaining({
        level: 'info',
        extra: expect.objectContaining({
          file: '/assets/ProjektiLanding-AqD-Fu5l.css',
          href: 'https://vmbalance.com/projekti',
          attempt: 1,
        }),
        tags: { source: 'vite_preload_error' },
      })
    );
    expect(flush).toHaveBeenCalledWith(2000);
  });

  it('reloads at most twice per tab and then reports a warning', async () => {
    const win = createMockWindow();
    registerVitePreloadErrorRecovery(win);

    win.dispatchEvent(preloadEvent(new Error('Unable to preload CSS for /assets/a.css')));
    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledTimes(1), { timeout: 15000 });

    win.dispatchEvent(preloadEvent(new Error('Unable to preload CSS for /assets/a.css')));
    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledTimes(2), { timeout: 15000 });

    const third = preloadEvent(new Error('Unable to preload CSS for /assets/a.css'));
    win.dispatchEvent(third);
    await new Promise((r) => setTimeout(r, 20));

    expect(win.location.reload).toHaveBeenCalledTimes(2);

    const { captureMessage } = await import('@sentry/react');
    expect(captureMessage).toHaveBeenLastCalledWith(
      'Preload asset still missing after reloads',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ attempt: 2 }),
      })
    );
  });

  it('falls back to a readable name when payload has no file path', async () => {
    const win = createMockWindow();
    registerVitePreloadErrorRecovery(win);

    win.dispatchEvent(preloadEvent());

    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledOnce(), { timeout: 15000 });

    const { captureMessage } = await import('@sentry/react');
    expect(captureMessage).toHaveBeenCalledWith(
      'Stale preload asset after deploy',
      expect.objectContaining({
        extra: expect.objectContaining({ file: 'unknown' }),
      })
    );
  });

  it('still reloads when sessionStorage is unavailable', async () => {
    const win = createMockWindow({ storageThrows: true });
    registerVitePreloadErrorRecovery(win);

    win.dispatchEvent(preloadEvent(new Error('Unable to preload CSS for /assets/a.css')));

    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledOnce(), { timeout: 15000 });
  });
});
