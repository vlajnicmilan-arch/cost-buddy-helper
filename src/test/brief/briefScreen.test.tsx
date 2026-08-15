import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BriefGate from '@/pages/BriefGate';
import type { BriefSnapshot } from '@/lib/brief/types';
import { BRIEF_CONTINUITY_KEY } from '@/lib/brief/continuity';

const rpcMock = vi.fn();

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
  instantCache: { read: () => null, write: () => undefined },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) =>
      typeof opts === 'string' ? opts : key,
  }),
}));

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

const snapshot = (categories: BriefSnapshot['categories']): BriefSnapshot => ({
  enabled: true,
  categories,
});

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
});

describe('BriefGate ekran', () => {
  it('prikazuje poruku i zapisuje kontinuitet tek pri stvarnom prikazu', async () => {
    rpcMock.mockResolvedValue({
      data: snapshot({
        uncertainty: { count: 2, watermark: '2026-08-15T08:00:00Z', filter: { path: '/dokumenti', tab: 'pending' } },
      }),
      error: null,
    });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    expect(screen.getByTestId('brief-gate-message').textContent).toBe('briefGate.uncertainty.new');
    await waitFor(() => expect(localStorage.getItem(BRIEF_CONTINUITY_KEY)).toBeTruthy());
  });

  it('nema istina => ekran se ne prikazuje kao vrata (MIRNO poruka bez akcije)', async () => {
    rpcMock.mockResolvedValue({
      data: snapshot({ uncertainty: { count: 0, watermark: null, filter: { path: '/dokumenti', tab: 'pending' } } }),
      error: null,
    });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    expect(screen.queryByTestId('brief-gate-action')).toBeNull();
  });

  it('greska RPC-a => tiho u /home', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderGate();
    await screen.findByText('HOME');
  });

  it('onemogucen korisnik => /home', async () => {
    rpcMock.mockResolvedValue({ data: { enabled: false }, error: null });
    renderGate();
    await screen.findByText('HOME');
  });

  it('akcija vodi na dokazivu destinaciju', async () => {
    rpcMock.mockResolvedValue({
      data: snapshot({
        uncertainty: { count: 1, watermark: null, filter: { path: '/dokumenti', tab: 'pending' } },
      }),
      error: null,
    });
    renderGate();
    fireEvent.click(await screen.findByTestId('brief-gate-action'));
    await screen.findByText('DOKUMENTI');
  });

  it('ulaz uvijek postoji', async () => {
    rpcMock.mockResolvedValue({
      data: snapshot({ due: { count: 3, watermark: null, filter: { path: '/home', view: 'overdue' } } }),
      error: null,
    });
    renderGate();
    fireEvent.click(await screen.findByTestId('brief-gate-enter'));
    await screen.findByText('HOME');
  });

  it('vise poruka => tocke za listanje', async () => {
    rpcMock.mockResolvedValue({
      data: snapshot({
        uncertainty: { count: 1, watermark: null, filter: { path: '/dokumenti', tab: 'pending' } },
        due: { count: 2, watermark: null, filter: { path: '/home' } },
      }),
      error: null,
    });
    renderGate();
    await screen.findByTestId('brief-gate-message');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});
