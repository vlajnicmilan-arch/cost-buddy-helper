/**
 * Prikaz oslobađanja mrtvog dokumenta u tabu „Primljeno".
 *
 * Dokazuje oba ishoda kroz stvarno renderiranu komponentu:
 *  - uvoz ne postoji → dodir na „Vrati u obradu" uspije i javi povratak,
 *  - uvoz postoji → poslužitelj odbija, korisnik dobiva razlog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-i18next', async () =>
  (await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
);

const rpcCalls: Array<{ fn: string; args: unknown }> = [];
let releaseResult: { ok: boolean; reason?: string } = { ok: true };

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then')
          return (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(res);
        return () => builder;
      },
    },
  );
  return {
    supabase: {
      from: () => builder,
      rpc: (fn: string, args?: unknown) => {
        rpcCalls.push({ fn, args });
        if (fn === 'mail_items_stuck_linked') {
          return Promise.resolve({
            data: [
              {
                id: 'item-1',
                classification: 'izvod',
                subject: 'Erste izvadak',
                extraction: { bank_name: 'Erste' },
                updated_at: '2026-09-03T03:22:55.000Z',
              },
            ],
            error: null,
          });
        }
        if (fn === 'mail_item_release_linked') {
          return Promise.resolve({ data: releaseResult, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner-1' } }) }));
vi.mock('@/hooks/useMailInbox', () => ({
  useMailInbox: () => ({ messages: [], loading: false, refetch: () => {} }),
}));
vi.mock('@/hooks/useMailDiscardedItems', () => ({
  useMailDiscardedItems: () => ({
    items: [],
    loading: false,
    working: false,
    restoreItem: async () => true,
  }),
}));

const feedback: Array<{ kind: string; text: string }> = [];
vi.mock('@/hooks/useStatusFeedback', () => ({
  showSuccess: (text: string) => feedback.push({ kind: 'success', text }),
  showError: (text: string) => feedback.push({ kind: 'error', text }),
}));

import { DocumentsReceivedTab } from '@/components/mail/DocumentsReceivedTab';

describe('Primljeno → dokumenti bez uvoza', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    feedback.length = 0;
  });

  it('nudi vraćanje u obradu i uspije kad uvoz ne postoji', async () => {
    releaseResult = { ok: true };
    render(<DocumentsReceivedTab active />);

    const row = await screen.findByTestId('stuck-linked-item');
    expect(row.textContent).toContain('Erste');

    fireEvent.click(screen.getByText('Vrati u obradu'));
    await waitFor(() => expect(feedback.length).toBeGreaterThan(0));
    expect(feedback[0]).toEqual({ kind: 'success', text: 'Dokument je vraćen na pregled' });
    expect(rpcCalls.some((c) => c.fn === 'mail_item_release_linked')).toBe(true);
  });

  it('odbija kad uvoz postoji i pokazuje razlog', async () => {
    releaseResult = { ok: false, reason: 'uvoz_postoji' };
    render(<DocumentsReceivedTab active />);

    await screen.findByTestId('stuck-linked-item');
    fireEvent.click(screen.getByText('Vrati u obradu'));
    await waitFor(() => expect(feedback.length).toBeGreaterThan(0));
    expect(feedback[0]).toEqual({
      kind: 'error',
      text: 'Uvoz iz ovog dokumenta postoji — ne može se vratiti.',
    });
  });
});
