/**
 * Guard — vlasnikov izlazak nikad ne smije ostaviti Krug bez vlasnika.
 *
 * Dokazuje na razini UI-ja:
 *  1) bez punopravnih clanova nema gumba za potvrdu (arhiviranje je zasebna
 *     isporuka, ne simuliramo je)
 *  2) potvrda je onemogucena dok nasljednik nije odabran — RPC se ne poziva
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BackButtonProvider } from '@/contexts/BackButtonContext';
import { KrugOwnerLeaveDialog } from '@/components/krug/KrugOwnerLeaveDialog';
import type { KrugMemberView } from '@/hooks/useKrug';

vi.mock('@/hooks/useUserProfiles', () => ({
  useUserProfiles: () => new Map(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

function renderDialog(members: KrugMemberView[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BackButtonProvider>
        <KrugOwnerLeaveDialog
          krugId="k1"
          members={members}
          open
          onOpenChange={() => {}}
        />
      </BackButtonProvider>
    </QueryClientProvider>,
  );
}

const owner: KrugMemberView = {
  user_id: 'owner',
  kind: 'owner',
  membership_id: 'm0',
  added_by: null,
  added_at: null,
};
const casual: KrugMemberView = {
  user_id: 'casual',
  kind: 'obicni',
  membership_id: 'm1',
  added_by: 'owner',
  added_at: null,
};
const full: KrugMemberView = {
  user_id: 'full',
  kind: 'punopravni',
  membership_id: 'm2',
  added_by: 'owner',
  added_at: null,
};

describe('KrugOwnerLeaveDialog — guard', () => {
  it('bez punopravnih clanova ne nudi potvrdu izlaska', () => {
    renderDialog([owner, casual]);
    expect(screen.queryByText(/Predaj i izađi/i)).toBeNull();
    expect(screen.getByText(/arhiviranje kruga/i)).toBeTruthy();
  });

  it('potvrda je onemogucena dok nasljednik nije odabran', () => {
    renderDialog([owner, full]);
    const confirm = screen.getByText(/Predaj i izađi/i).closest('button');
    expect(confirm).toBeTruthy();
    expect(confirm).toBeDisabled();
  });
});
