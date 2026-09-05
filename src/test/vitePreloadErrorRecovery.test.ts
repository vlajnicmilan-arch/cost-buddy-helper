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

const createMockWindow = () => {
  const listeners: Record<string, EventListener[]> = {};
  const storage: Record<string, string> = {};

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
    sessionStorage: {
      getItem: vi.fn((k: string) => storage[k] ?? null),
      setItem: vi.fn((k: string, v: string) => {
        storage[k] = v;
      }),
      removeItem: vi.fn((k: string) => {
        delete storage[k];
      }),
    },
  } as unknown as Window & typeof globalThis;
};

describe('registerVitePreloadErrorRecovery', () => {
  let registerVitePreloadErrorRecovery: typeof import('@/main').registerVitePreloadErrorRecovery;

  beforeEach(async () => {
    vi.clearAllMocks();

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


  it('prevents default, logs to Sentry, and reloads once', async () => {
    const win = createMockWindow();
    registerVitePreloadErrorRecovery(win);

    const event = new Event('vite:preloadError', { cancelable: true });
    (event as any).payload = '/assets/ProjektiLanding-AqD-Fu5l.css';

    win.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledOnce(), { timeout: 3000 });

    const { initSentry } = await import('@/lib/sentry');
    const { captureMessage, flush } = await import('@sentry/react');

    expect(initSentry).toHaveBeenCalledOnce();
    expect(captureMessage).toHaveBeenCalledWith(
      'Stale preload asset after deploy',
      expect.objectContaining({
        level: 'info',
        extra: expect.objectContaining({
          file: '/assets/ProjektiLanding-AqD-Fu5l.css',
          href: 'https://vmbalance.com/projekti',
        }),
        tags: { source: 'vite_preload_error' },
      })
    );
    expect(flush).toHaveBeenCalledWith(2000);
  });

  it('does not reload twice within 30 seconds', async () => {
    const win = createMockWindow();
    registerVitePreloadErrorRecovery(win);

    const first = new Event('vite:preloadError', { cancelable: true });
    (first as any).payload = '/assets/ProjektiLanding-AqD-Fu5l.css';
    win.dispatchEvent(first);

    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledTimes(1), { timeout: 3000 });

    const second = new Event('vite:preloadError', { cancelable: true });
    (second as any).payload = '/assets/react-vendor-D__4iQON.js';
    win.dispatchEvent(second);

    // Give any async work a tick, then confirm no second reload happened.
    await new Promise((r) => setTimeout(r, 10));
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('falls back to unknown file name when payload is missing', async () => {
    const win = createMockWindow();
    registerVitePreloadErrorRecovery(win);

    const event = new Event('vite:preloadError', { cancelable: true });
    win.dispatchEvent(event);

    await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledOnce());

    const { captureMessage } = await import('@sentry/react');
    expect(captureMessage).toHaveBeenCalledWith(
      'Stale preload asset after deploy',
      expect.objectContaining({
        extra: expect.objectContaining({ file: 'unknown' }),
      })
    );
  });
});
