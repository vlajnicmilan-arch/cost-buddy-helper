import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  filterProjectsByBusinessScope,
  isProjectInBusinessScope,
} from '@/lib/businessProjectScope';

const PROJECTS = [
  { id: 'p1', name: 'Tactura A', business_profile_id: 'biz-1' },
  { id: 'p2', name: 'Osobni', business_profile_id: null },
  { id: 'p3', name: 'Druga firma', business_profile_id: 'biz-2' },
];

const COLLABORATORS = [
  { id: 'c1', project_id: 'p1', first_name: 'Ana', last_name: 'A', total_price: 10, paid_amount: 0 },
  { id: 'c2', project_id: 'p2', first_name: 'Bruno', last_name: 'B', total_price: 10, paid_amount: 0 },
  { id: 'c3', project_id: 'p3', first_name: 'Cvita', last_name: 'C', total_price: 10, paid_amount: 0 },
];

let activeBusinessProfileId: string | null = null;

const TEST_USER = { id: 'u1' };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: TEST_USER }) }));
vi.mock('@/contexts/AppStateContext', () => ({
  useAppState: () => ({ activeBusinessProfileId }),
}));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => Promise.resolve({ data: PROJECTS, error: null }),
      in: (_col: string, ids: string[]) =>
        Promise.resolve({
          data: COLLABORATORS.filter((c) => ids.includes(c.project_id)),
          error: null,
        }),
    };
    if (table === 'project_collaborators') {
      chain.select = () => ({ in: chain.in });
    }
    return chain;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

describe('businessProjectScope', () => {
  it('owned project of the profile is in scope', () => {
    expect(isProjectInBusinessScope({ business_profile_id: 'biz-1' }, 'biz-1')).toBe(true);
    expect(isProjectInBusinessScope({ business_profile_id: 'biz-2' }, 'biz-1')).toBe(false);
  });

  it('shared project joined under the profile is in scope', () => {
    expect(
      isProjectInBusinessScope(
        { isOwner: false, member_context: 'business', member_business_profile_id: 'biz-1' },
        'biz-1',
      ),
    ).toBe(true);
    expect(
      isProjectInBusinessScope(
        { isOwner: false, member_context: 'personal', member_business_profile_id: 'biz-1' },
        'biz-1',
      ),
    ).toBe(false);
  });

  it('no active profile keeps every project (personal mode)', () => {
    expect(filterProjectsByBusinessScope(PROJECTS, null)).toHaveLength(3);
    expect(filterProjectsByBusinessScope(PROJECTS, 'biz-1').map((p) => p.id)).toEqual(['p1']);
  });
});

describe('useCollaboratorOverview scoping', () => {
  beforeEach(() => {
    activeBusinessProfileId = null;
  });

  it('returns all collaborators in personal mode', async () => {
    const { useCollaboratorOverview } = await import('@/hooks/useCollaboratorOverview');
    const { result } = renderHook(() => useCollaboratorOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('returns only collaborators of the active business profile', async () => {
    activeBusinessProfileId = 'biz-1';
    const { useCollaboratorOverview } = await import('@/hooks/useCollaboratorOverview');
    const { result } = renderHook(() => useCollaboratorOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.id)).toEqual(['c1']);
    expect(result.current.projectOptions.map((p) => p.id)).toEqual(['p1']);
  });
});
