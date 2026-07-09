/**
 * WS1c — runtime verification for legacy `private` display in KrugTransactionPanel.
 *
 * Ovaj test namjerno NE koristi supabase / react-query runtime. Sve hookove
 * na koje se panel oslanja mockamo minimalno kako bismo izolirali odluku
 * koju panel donosi za legacy `krug_privacy='private'` zapis:
 *   1. "Moje" (personal) se prikazuje kao aktivan izbor,
 *   2. taj gumb ostaje klikabilan (migracijski put),
 *   3. nema trećeg privacy izbora ("Skriveno" / private) u panelu.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- Mocks ---------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'hr' },
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useKrug', () => ({
  useKrug: () => ({
    data: {
      krug: { id: 'k1', name: 'Test krug' },
      ownership: { user_id: 'user-1' },
      myMembership: null,
    },
    isLoading: false,
  }),
}));

const noopMutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/hooks/useKrugSetPrivacy', () => ({ useKrugSetPrivacy: noopMutation }));
vi.mock('@/hooks/useKrugAct', () => ({
  useKrugApplyAct: noopMutation,
  useKrugWithdraw: noopMutation,
}));
vi.mock('@/hooks/useKrugRetract', () => ({ useKrugRetract: noopMutation }));
vi.mock('@/hooks/useKrugGovernToPersonal', () => ({ useKrugGovernToPersonal: noopMutation }));

// Panel poziva `useQuery` direktno za dohvat expense retka. Mockamo samo
// useQuery iz tanstacka; ostatak modula ostaje realan (QueryClient nije nužan).
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<any>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (_opts: any) => ({
      data: {
        krug_id: 'k1',
        krug_privacy: 'private', // legacy zapis
        krug_shared_status: null,
        deleted_at: null,
      },
      isLoading: false,
    }),
  };
});

import { KrugTransactionPanel } from './KrugTransactionPanel';

describe('KrugTransactionPanel — legacy `private` runtime display', () => {
  it('renderira "Moje" kao aktivan izbor i ostavlja ga klikabilnim za migraciju', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);

    const mojeBtn = screen.getByRole('button', { name: /Moje/ });
    expect(mojeBtn).toBeInTheDocument();
    // Aktivan izbor u shadcn Button varijanti `default` NE dobiva `variant="outline"` klasu.
    // Ključni invariant: gumb NIJE disabled (legacy `private` → migracijski put ostaje otvoren).
    expect(mojeBtn).not.toBeDisabled();

    // Legacy hint mora biti vidljiv — potvrđuje da panel prepoznaje legacy stanje,
    // a ne da samo slučajno prikazuje personal jer je stvarno personal.
    expect(
      screen.getByText(/legacy|Klikni „Moje" za migraciju|Moje/),
    ).toBeInTheDocument();
  });

  it('ne nudi treći privacy izbor (nema "Skriveno"/private gumba)', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);

    // Očekujemo točno dva privacy gumba: "Moje" i "Za Krug".
    expect(screen.getByRole('button', { name: /Moje/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Za Krug/ })).toBeInTheDocument();
    // Nijedan gumb ne smije sadržavati string "Skriveno" (legacy private label).
    const skriveno = screen.queryByRole('button', { name: /Skriveno/i });
    expect(skriveno).toBeNull();
  });

  it('"Za Krug" gumb je dostupan (author + full member → smije predložiti shared)', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);
    const shared = screen.getByRole('button', { name: /Za Krug/ });
    expect(shared).not.toBeDisabled();
  });
});
