/**
 * Renders the admin users list and proves the two states side by side:
 * an EMPTY account shows the delete button, an account WITH DATA shows a
 * reason and NO button (not even a disabled one).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AppUser } from '@/components/admin/types';

vi.mock('react-i18next', async () => (await import('@/test/mocks/reactI18next')).createReactI18nextMock());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ is: () => ({ or: () => Promise.resolve({ data: [] }) }) }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

vi.mock('@/hooks/useAccountEmptiness', () => ({
  useAccountEmptiness: () => ({
    emptiness: {
      'u-empty': { empty: true, blockers: [], is_admin: false, is_self: false },
      'u-full': {
        empty: false,
        blockers: [
          { table: 'expenses', count: 12 },
          { table: 'projects', count: 2 },
        ],
        is_admin: false,
        is_self: false,
      },
    },
    loading: false,
    reload: vi.fn(),
  }),
}));

import { UsersTab } from '@/components/admin/UsersTab';

const mkUser = (id: string, email: string): AppUser => ({
  id,
  email,
  display_name: email,
  currency: 'EUR',
  created_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: null,
  confirmed_at: null,
  banned_until: null,
  roles: [],
  last_device_info: null,
  last_login_at: null,
  referral_count: 0,
  app_version: null,
});

const users = [mkUser('u-empty', 'prazan@test.local'), mkUser('u-full', 'pun@test.local')];

const renderTab = (expandedUserId: string) =>
  render(
    <UsersTab
      users={users}
      usersLoading={false}
      hasMoreUsers={false}
      usersPage={0}
      expandedUserId={expandedUserId}
      setExpandedUserId={() => {}}
      actionLoading={null}
      currentUserId="admin-1"
      onRefresh={() => {}}
      onLoadMore={() => {}}
      onManageUser={() => {}}
    />,
  );

describe('UsersTab account emptiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('empty account: shows "empty" state and the delete button', () => {
    renderTab('u-empty');
    expect(screen.getByText('admin.emptyAccount.stateEmpty')).toBeInTheDocument();
    expect(screen.getByText('admin.emptyAccount.deleteCta')).toBeInTheDocument();
  });

  it('account with data: shows the reason and NO delete button', () => {
    renderTab('u-full');
    expect(screen.getByText('admin.emptyAccount.stateHasData')).toBeInTheDocument();
    expect(screen.getByText(/entity.expenses/)).toBeInTheDocument();
    expect(screen.queryByText('admin.emptyAccount.deleteCta')).toBeNull();
  });

  it('delete dialog requires typing the exact email', () => {
    renderTab('u-empty');
    fireEvent.click(screen.getByText('admin.emptyAccount.deleteCta'));
    const confirm = screen.getByText('admin.emptyAccount.confirmCta').closest('button')!;
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('admin.emptyAccount.confirmInputLabel'), {
      target: { value: 'prazan@test.local' },
    });
    expect(confirm).not.toBeDisabled();
  });
});
