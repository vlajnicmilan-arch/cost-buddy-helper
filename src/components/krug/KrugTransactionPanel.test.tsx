/**
 * WS1c/WS1d — runtime verification for legacy `private` display in KrugTransactionPanel.
 *
 * Ovaj test namjerno NE koristi supabase / react-query runtime. Sve hookove
 * na koje se panel oslanja mockamo minimalno kako bismo izolirali odluku
 * koju panel donosi za legacy `krug_privacy='private'` zapis:
 *   1. "Moje" (personal) se prikazuje kao aktivan izbor (variant=default → bg-primary),
 *   2. taj gumb ostaje klikabilan (migracijski put),
 *   3. klik zove `useKrugSetPrivacy().mutate` s `{ expenseId, newPrivacy: 'personal' }`,
 *   4. nema trećeg privacy izbora ("Skriveno" / private) u panelu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// vi.hoisted — dostupno prije vi.mock factory-a, ali svježe po test datoteci.
const hoisted = vi.hoisted(() => ({
  setPrivacyMutate: vi.fn(),
  retractMutate: vi.fn(),
  expenseRow: {
    krug_id: 'k1',
    krug_privacy: 'private' as 'private' | 'personal' | 'shared',
    krug_shared_status: null as null | 'predlozena' | 'potvrdjena' | 'nepotvrdjena',
    deleted_at: null as string | null,
  },
}));

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

vi.mock('@/hooks/useKrugSetPrivacy', () => ({
  useKrugSetPrivacy: () => ({ mutate: hoisted.setPrivacyMutate, isPending: false }),
}));
vi.mock('@/hooks/useKrugAct', () => ({
  useKrugApplyAct: () => ({ mutate: vi.fn(), isPending: false }),
  useKrugWithdraw: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useKrugRetract', () => ({
  useKrugRetract: () => ({ mutate: hoisted.retractMutate, isPending: false }),
}));
vi.mock('@/hooks/useKrugGovernToPersonal', () => ({
  useKrugGovernToPersonal: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Panel poziva `useQuery` direktno za dohvat expense retka. Mockamo samo
// useQuery iz tanstacka; ostatak modula ostaje realan (QueryClient nije nužan).
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<any>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (_opts: any) => ({
      data: hoisted.expenseRow,
      isLoading: false,
    }),
  };
});

import { KrugTransactionPanel } from './KrugTransactionPanel';

beforeEach(() => {
  hoisted.setPrivacyMutate.mockClear();
  hoisted.retractMutate.mockClear();
  hoisted.expenseRow = {
    krug_id: 'k1',
    krug_privacy: 'private',
    krug_shared_status: null,
    deleted_at: null,
  };
});

describe('KrugTransactionPanel — legacy `private` runtime display', () => {
  it('renderira "Moje" kao AKTIVAN izbor (variant=default → bg-primary) i nije disabled', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);

    const mojeBtn = screen.getByRole('button', { name: /Moje/ });
    expect(mojeBtn).toBeInTheDocument();
    expect(mojeBtn).not.toBeDisabled();
    // Aktivan izbor: shadcn Button variant="default" → `bg-module` klasa
    // u ovom projektu (default varijanta je re-tema-rana). Neaktivan
    // (`outline`) NEMA `bg-module`, pa je ovo ne-slučajni marker aktivnosti.
    expect(mojeBtn.className).toMatch(/\bbg-module\b/);

    // "Za Krug" MORA biti neaktivan (variant=outline → bez bg-module).
    const sharedBtn = screen.getByRole('button', { name: /Za Krug/ });
    expect(sharedBtn.className).not.toMatch(/\bbg-module\b/);

    // Legacy hint mora biti vidljiv.
    expect(
      screen.getByText(/Klikni „Moje" za migraciju/),
    ).toBeInTheDocument();
  });

  it('klik na aktivan "Moje" u legacy slučaju zove setPrivacy.mutate({ expenseId, newPrivacy: "personal" })', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);

    const mojeBtn = screen.getByRole('button', { name: /Moje/ });
    fireEvent.click(mojeBtn);

    expect(hoisted.setPrivacyMutate).toHaveBeenCalledTimes(1);
    expect(hoisted.setPrivacyMutate).toHaveBeenCalledWith(
      { expenseId: 'e1', newPrivacy: 'personal' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('ne nudi treći privacy izbor (nema "Skriveno"/private gumba)', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);

    expect(screen.getByRole('button', { name: /Moje/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Za Krug/ })).toBeInTheDocument();
    const skriveno = screen.queryByRole('button', { name: /Skriveno/i });
    expect(skriveno).toBeNull();
  });

  it('"Za Krug" gumb je dostupan (author + full member → smije predložiti shared)', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);
    const shared = screen.getByRole('button', { name: /Za Krug/ });
    expect(shared).not.toBeDisabled();
  });
});

/**
 * WS4 — A3 retract runtime verification.
 *
 * Dokazujemo da UI stvarno nudi "Vrati na osobno" i da klik zove
 * `useKrugRetract().mutate({ expenseId })` točno jednom s ispravnim argumentima.
 * Fixture zadovoljava sve decideRetract uvjete: author + full member +
 * shared + predlozena + not deleted.
 */
describe('KrugTransactionPanel — A3 retract runtime (WS4)', () => {
  beforeEach(() => {
    hoisted.expenseRow = {
      krug_id: 'k1',
      krug_privacy: 'shared',
      krug_shared_status: 'predlozena',
      deleted_at: null,
    };
  });

  it('renderira A3 "Vrati na osobno" akciju kad su svi uvjeti zadovoljeni', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);
    const btn = screen.getByRole('button', { name: /Vrati na osobno/ });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('klik na A3 zove retract.mutate točno jednom s { expenseId }', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="user-1" />);
    const btn = screen.getByRole('button', { name: /Vrati na osobno/ });
    fireEvent.click(btn);

    expect(hoisted.retractMutate).toHaveBeenCalledTimes(1);
    expect(hoisted.retractMutate).toHaveBeenCalledWith(
      { expenseId: 'e1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('A3 se NE nudi kad korisnik nije autor (guard očuvan)', () => {
    render(<KrugTransactionPanel expenseId="e1" expenseAuthorId="someone-else" />);
    expect(screen.queryByRole('button', { name: /Vrati na osobno/ })).toBeNull();
  });
});
