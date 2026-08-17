/**
 * BRIEF-VRATA V1 — svjezina sjemena i zamrzavanje prikazane snimke.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BriefGate from '@/pages/BriefGate';
import type { BriefSnapshot } from '@/lib/brief/types';
import { BRIEF_GATE_CACHE_MAX_AGE_MS } from '@/lib/briefGate';
import { BRIEF_CONTINUITY_KEY } from '@/lib/brief/continuity';

const rpcMock = vi.fn();
const cacheRead = vi.fn();
const cacheWrite = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => ({ displayName: 'Milan' }),
}));

vi.mock('@/lib/instantCache', () => ({
  instantCache: {
    read: (...args: unknown[]) => cacheRead(...args),
    write: (...args: unknown[]) => cacheWrite(...args),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => {
      if (typeof opts === 'string') return opts;
      const count = (opts as { count?: number } | undefined)?.count;
      return count === undefined ? key : `${key}:${count}`;
    },
  }),
}));

const snapshot = (count: number): BriefSnapshot => ({
  enabled: true,
  categories: {
    uncertainty: { count, watermark: null, filter: { path: '/dokumenti', tab: 'pending' } },
  },
});

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<BriefGate />} />
        <Route path="/home" element={<div>HOME</div>} />
        <Route path="/dokumenti" element={<div>DOKUMENTI</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
  cacheRead.mockReset();
  cacheWrite.mockReset();
});

describe('brief vrata — sjeme i zamrzavanje', () => {
  it('svjeze sjeme => prikaz odmah, bez cekanja RPC-a', async () => {
    cacheRead.mockReturnValue({ cachedAt: Date.now(), snapshot: snapshot(2) });
    rpcMock.mockReturnValue(new Promise(() => undefined));
    renderGate();
    expect(screen.getByTestId('brief-gate-message').textContent).toBe('briefGate.uncertainty.new:2');
  });

  it('ustajalo sjeme (> 15 min) => tretira se kao odsutno, fail-open na gresku', async () => {
    cacheRead.mockReturnValue({
      cachedAt: Date.now() - BRIEF_GATE_CACHE_MAX_AGE_MS - 1000,
      snapshot: snapshot(2),
    });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderGate();
    await screen.findByText('HOME');
  });

  it('zakasnjeli RPC ne mijenja prikazani tekst, ali osvjezava predmemoriju', async () => {
    cacheRead.mockReturnValue({ cachedAt: Date.now(), snapshot: snapshot(2) });
    let resolveRpc: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((res) => { resolveRpc = res; }));
    renderGate();
    // Prikaz iz sjemena dolazi kroz effect — pod opterecenjem CI-a nije gotov u
    // istom tiku, pa se ceka umjesto sinkrone tvrdnje (ista obitelj lijeka kao
    // ranije u briefScreen). Ponasanje nedirnuto.
    await waitFor(
      () => expect(screen.getByTestId('brief-gate-message').textContent).toBe('briefGate.uncertainty.new:2'),
      { timeout: 15000 },
    );

    resolveRpc({ data: snapshot(9), error: null });
    await waitFor(() => expect(cacheWrite).toHaveBeenCalled(), { timeout: 15000 });
    expect(cacheWrite.mock.calls[0][1].snapshot.categories.uncertainty.count).toBe(9);
    expect(screen.getByTestId('brief-gate-message').textContent).toBe('briefGate.uncertainty.new:2');
  }, 20000);

  it('djelomicna snimka => kontinuitet drugih kategorija ostaje netaknut', async () => {
    localStorage.setItem(
      BRIEF_CONTINUITY_KEY,
      JSON.stringify({
        mail: { count: 3, watermark: '2026-08-14T08:00:00Z', shownAt: '2026-08-14T08:00:00Z' },
      }),
    );
    cacheRead.mockReturnValue(null);
    rpcMock.mockResolvedValue({
      data: {
        enabled: true,
        categories: { due: { count: 2, watermark: null, filter: { path: '/home', view: 'overdue' } } },
      },
      error: null,
    });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(BRIEF_CONTINUITY_KEY) ?? '{}');
      expect(stored.mail?.count).toBe(3);
      expect(stored.due?.count).toBe(2);
    });
  });
});
