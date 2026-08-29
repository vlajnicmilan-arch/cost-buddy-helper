/**
 * BRIEF-VRATA — svaki izlaz mora ostaviti zapis `brief_gate_exit`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BriefGate from '@/pages/BriefGate';
import type { BriefSnapshot } from '@/lib/brief/types';
import { buildBriefExitDetails, truthsFromBriefSnapshot } from '@/lib/brief/exitTelemetry';

const rpcMock = vi.fn();
const logMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
}));

vi.mock('@/lib/diagnosticLogger', () => ({
  logDiagnostic: (...args: unknown[]) => logMock(...args),
}));

vi.mock('@/contexts/AppStateContext', () => ({ useAppState: () => ({ displayName: 'Milan' }) }));
vi.mock('@/lib/instantCache', () => ({ instantCache: { read: () => null, write: () => undefined } }));
vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<BriefGate />} />
        <Route path="/home" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );

const lastExit = () => {
  const call = [...logMock.mock.calls].reverse().find((c) => c[0] === 'brief_gate_exit');
  return call?.[1] as Record<string, unknown> | undefined;
};

const dueSnapshot: BriefSnapshot = {
  enabled: true,
  categories: {
    due: {
      count: 89,
      watermark: '2026-08-29T10:00:00Z',
      nextDue: '2026-08-30',
      issuer: null,
      filter: { path: '/home', view: 'overdue' },
    },
  },
};

describe('brief_gate_exit — zapis razloga', () => {
  beforeEach(() => {
    logMock.mockClear();
    rpcMock.mockReset();
    localStorage.clear();
  });

  it('not_enabled', async () => {
    rpcMock.mockResolvedValue({ data: { enabled: false }, error: null });
    renderGate();
    await screen.findByText('HOME');
    await waitFor(() => expect(lastExit()?.reason).toBe('not_enabled'));
    expect(lastExit()?.messages_count).toBe(0);
  });

  it('shown', async () => {
    rpcMock.mockResolvedValue({ data: dueSnapshot, error: null });
    renderGate();
    await waitFor(() => expect(lastExit()?.reason).toBe('shown'));
    const d = lastExit()!;
    expect((d.truths as { invoiceCount: number }).invoiceCount).toBe(89);
    expect(typeof d.elapsed_ms).toBe('number');
    expect(typeof d.rpc_ms).toBe('number');
  });

  it('timed_out (greska RPC-a bez snimke)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    renderGate();
    await screen.findByText('HOME');
    await waitFor(() => expect(lastExit()?.reason).toBe('timed_out'));
    expect(lastExit()?.snapshot).toBeNull();
  });

  it('pad logiranja ne rusi ekran', async () => {
    logMock.mockImplementationOnce(() => {
      throw new Error('log down');
    });
    rpcMock.mockResolvedValue({ data: dueSnapshot, error: null });
    renderGate();
    expect(await screen.findByTestId('brief-gate')).toBeTruthy();
  });
});

describe('buildBriefExitDetails — cista logika', () => {
  it('no_messages nosi brojke iz snimke', () => {
    const d = buildBriefExitDetails({
      reason: 'no_messages',
      elapsedMs: 12.6,
      rpcMs: 88.2,
      snapshot: { enabled: true, categories: { mail: { count: 4, watermark: null, filter: null } } },
      messagesCount: 0,
      build: 'sha',
    });
    expect(d.reason).toBe('no_messages');
    expect(d.elapsed_ms).toBe(13);
    expect(d.rpc_ms).toBe(88);
    expect(d.build).toBe('sha');
    expect(truthsFromBriefSnapshot(null).invoiceCount).toBe(0);
  });

  it('sazetak ne nosi naziv dobavljaca', () => {
    const d = buildBriefExitDetails({ reason: 'shown', snapshot: dueSnapshot });
    expect(JSON.stringify(d.snapshot)).not.toContain('issuer');
  });
});
