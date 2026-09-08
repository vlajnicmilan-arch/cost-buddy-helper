/**
 * Hladni ulazak u /projects ne smije nuditi paywall prije nego se prava znaju,
 * niti vlasniku projekta koji nije u project_members.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  subscriptionReady: true,
  hasProjectsAccess: true,
  memberCount: 0,
  ownedCount: 0,
}));
const requestModule = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false, session: {} }),
}));
vi.mock('@/contexts/StorageContext', () => ({ useStorage: () => ({ storageMode: 'cloud' }) }));
vi.mock('@/hooks/useExpenses', () => ({ useExpenses: () => ({ refetch: vi.fn() }) }));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ subscriptionReady: state.subscriptionReady }),
}));
vi.mock('@/hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({ hasModuleAccess: () => state.hasProjectsAccess }),
}));
vi.mock('@/hooks/useModuleGate', () => ({ useModuleGate: () => ({ requestModule }) }));
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navigate,
}));
vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/TrialFeatureChip', () => ({ TrialFeatureChip: () => null }));
vi.mock('@/components/projects/PeopleTab', () => ({ PeopleTab: () => null }));
vi.mock('@/components/projects/CollaboratorsTab', () => ({ CollaboratorsTab: () => null }));
vi.mock('@/components/projects/ProjectsPanel', () => ({
  ProjectsPanel: ({ canCreate }: { canCreate: boolean }) => (
    <div data-testid="projects-panel" data-can-create={String(canCreate)} />
  ),
}));
vi.mock('@/components/access/ReadOnlyBanner', () => ({
  ReadOnlyBanner: () => <div data-testid="read-only-banner" />,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({
          count: table === 'projects' ? state.ownedCount : state.memberCount,
        }),
      }),
    }),
  },
}));

import Projects from '@/pages/Projects';

const renderPage = () =>
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>,
  );

describe('Projects — hladni ulazak i gate', () => {
  beforeEach(() => {
    requestModule.mockReset();
    navigate.mockReset();
    state.subscriptionReady = true;
    state.hasProjectsAccess = true;
    state.memberCount = 0;
    state.ownedCount = 0;
  });

  it('(a) pretplata nespremna → requestModule nije pozvan', async () => {
    state.subscriptionReady = false;
    state.hasProjectsAccess = false;
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('projects-panel')).toBeNull());
    expect(requestModule).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('(b) spremna + pravo aktivno + 0 članstava → panel s canCreate, bez dijaloga', async () => {
    renderPage();
    const panel = await screen.findByTestId('projects-panel');
    expect(panel.getAttribute('data-can-create')).toBe('true');
    expect(requestModule).not.toHaveBeenCalled();
  });

  it('(c) spremna + bez prava + vlasnik 1 projekta → read-only banner + panel, bez dijaloga', async () => {
    state.hasProjectsAccess = false;
    state.ownedCount = 1;
    renderPage();
    const panel = await screen.findByTestId('projects-panel');
    expect(panel.getAttribute('data-can-create')).toBe('false');
    expect(screen.getAllByTestId('read-only-banner').length).toBeGreaterThan(0);
    expect(requestModule).not.toHaveBeenCalled();
  });

  it('(d) spremna + bez prava + 0 projekata + 0 članstava → requestModule pozvan', async () => {
    state.hasProjectsAccess = false;
    renderPage();
    await waitFor(() => expect(requestModule).toHaveBeenCalledWith('projects', expect.anything()));
  });
});
