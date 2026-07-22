/**
 * Val B follow-up B: `krug_deletion_requested` navigation.
 *
 * Bell/push je do sada vodio na `/krug` (lista) umjesto na Krug čije je
 * brisanje inicirano. Edge fn `notify-krug-event` sada za taj event
 * zapisuje `route: '/krug?id=<krug_id>'`, a Krug page taj query param
 * mora čitati i otvoriti detail direktno.
 *
 * Ovaj test čuva client-side ugovor: kad je `?id=<uuid>` prisutan pri
 * mountu, `KrugDetailScreen` se rendera bez klika.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Krug from '@/pages/Krug';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/integrations/supabase/client', () => {
  // `useFeatureAccess` (rendered via Krug page) povlači `useMyActiveModuleGrants`,
  // koji zove `supabase.from('admin_module_grants')...select().eq().is().or()`.
  // Test se fokusira na routing, ali mock mora podržavati taj chain da hook ne
  // baci unhandled TypeError u passive effectu (vitest exit 1 u CI-ju).
  const queryChain: any = {
    select: () => queryChain,
    eq: () => queryChain,
    is: () => queryChain,
    or: () => Promise.resolve({ data: [], error: null }),
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => queryChain,
      channel: () => ({
        on: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      }),
      removeChannel: vi.fn(),
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      },
    },
  };
});

vi.mock('@/components/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/krug/KrugListScreen', () => ({
  KrugListScreen: () => <div data-testid="krug-list" />,
}));
vi.mock('@/components/krug/KrugDetailScreen', () => ({
  KrugDetailScreen: ({ krugId }: { krugId: string }) => (
    <div data-testid="krug-detail">{krugId}</div>
  ),
}));

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Krug />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Krug deep-link', () => {
  it('opens detail directly when ?id=<uuid> is present', async () => {
    const id = '5932d439-61a6-4fd8-a80e-6448d9a32328';
    renderAt(`/krug?id=${id}`);
    await waitFor(() => {
      expect(screen.getByTestId('krug-detail')).toHaveTextContent(id);
    });
  });

  it('shows list when no id param', () => {
    renderAt('/krug');
    expect(screen.getByTestId('krug-list')).toBeInTheDocument();
  });
});
