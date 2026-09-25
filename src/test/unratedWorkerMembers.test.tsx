import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react';
import { computeUnratedWorkerMembers, buildWorkerPrefill } from '@/lib/unratedWorkerMembers';

const s = vi.hoisted(() => ({
  addWorker: vi.fn(),
  link: vi.fn(),
  attach: vi.fn(),
  from: vi.fn(),
  lastSave: null as null | ((d: any) => Promise<void> | void),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: any) => (o && typeof o === 'object' ? `${k}:${o.days}/${o.hours}` : k) }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/useProjectWorkers', () => ({
  useProjectWorkers: () => ({ addWorker: s.addWorker, linkWorkerToMember: s.link }),
}));
vi.mock('@/hooks/useWorkerIdentityAttach', () => ({ useWorkerIdentityAttach: () => ({ attach: s.attach }) }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/components/projects/ProjectWorkerDialog', () => ({
  ProjectWorkerDialog: (p: any) => {
    s.lastSave = p.onSave;
    return p.open ? <div data-testid="dlg">{p.prefill?.first_name}|{p.prefill?.hourly_rate}</div> : null;
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...a: any[]) => s.from(...a) } }));

// Chainable thenable query stub
const q = (result: any) => {
  const o: any = {};
  for (const m of ['select', 'eq', 'in', 'is', 'limit']) o[m] = () => o;
  o.maybeSingle = () => Promise.resolve(result);
  o.then = (r: any, j: any) => Promise.resolve(result).then(r, j);
  return o;
};

const logs = [
  { user_id: 'p', log_date: '2026-09-14', hours: 8 },
  { user_id: 'p', log_date: '2026-09-15', hours: 7.5 },
  { user_id: 'p', log_date: '2026-09-16', hours: null },
  { user_id: 'x', log_date: '2026-09-14', hours: 3 },
];

describe('computeUnratedWorkerMembers', () => {
  it('Radnik bez zapisa → točan broj dana i sati', () => {
    const r = computeUnratedWorkerMembers([{ user_id: 'p', role: 'worker' }], [], logs);
    expect(r.get('p')).toEqual({ days: 2, hours: 15.5 });
  });
  it('Radnik sa zapisom ili druga uloga → bez upozorenja', () => {
    expect(computeUnratedWorkerMembers([{ user_id: 'p', role: 'worker' }], ['p'], logs).size).toBe(0);
    expect(computeUnratedWorkerMembers([{ user_id: 'x', role: 'member' }], [], logs).size).toBe(0);
  });
  it('prijedlog uzima zadnju satnicu s drugog projekta', () => {
    const p = buildWorkerPrefill({ id: 'w', first_name: 'Petar', last_name: 'P' }, [
      { worker_id: 'w', project_id: 'a', hourly_rate: 10, created_at: '2026-01-01' },
      { worker_id: 'w', project_id: 'b', hourly_rate: 12, created_at: '2026-05-01' },
      { worker_id: 'w', project_id: 'cur', hourly_rate: 99, created_at: '2026-09-01' },
    ], 'cur');
    expect(p).toMatchObject({ identityId: 'w', first_name: 'Petar', hourly_rate: 12 });
  });
});

describe('useUnratedWorkerMembers', () => {
  beforeEach(() => s.from.mockReset());
  it('radnik (ne-manager) ne vidi upozorenje i ništa se ne dohvaća', async () => {
    const { useUnratedWorkerMembers } = await import('@/hooks/useUnratedWorkerMembers');
    const members = [{ user_id: 'p', role: 'worker' }];
    const { result } = renderHook(() => useUnratedWorkerMembers('cur', members, false));
    await waitFor(() => expect(result.current.pending.size).toBe(0));
    expect(s.from).not.toHaveBeenCalled();
  });
  it('manager dobiva upozorenje s danima i satima', async () => {
    s.from.mockImplementation((t: string) =>
      t === 'project_workers' ? q({ data: [], error: null }) : q({ data: logs.filter((l) => l.user_id === 'p'), error: null }));
    const { useUnratedWorkerMembers } = await import('@/hooks/useUnratedWorkerMembers');
    const members = [{ user_id: 'p', role: 'worker' }];
    const { result } = renderHook(() => useUnratedWorkerMembers('cur', members, true));
    await waitFor(() => expect(result.current.pending.get('p')).toEqual({ days: 2, hours: 15.5 }));
  });
});

describe('UnratedWorkerSetup', () => {
  it('spremanje stvara zapis, veže osobu i zove povezivanje', async () => {
    s.from.mockImplementation((t: string) =>
      t === 'workers'
        ? q({ data: { id: 'w', first_name: 'Petar', last_name: 'P' }, error: null })
        : q({ data: [{ worker_id: 'w', project_id: 'b', hourly_rate: 12, created_at: '2026-05-01' }], error: null }));
    s.addWorker.mockResolvedValue({ id: 'new' });
    s.link.mockResolvedValue({ success: true, backfilled: 2 });
    const onDone = vi.fn();
    const { UnratedWorkerSetup } = await import('@/components/projects/UnratedWorkerSetup');
    render(<UnratedWorkerSetup projectId="cur" memberUserId="p" memberName="Petar P" pending={{ days: 5, hours: 37 }} onDone={onDone} />);
    expect(screen.getByText('projects.unratedWorkerPending:5/37')).toBeInTheDocument();
    fireEvent.click(screen.getByText('projects.unratedWorkerSetRate'));
    expect(await screen.findByTestId('dlg')).toHaveTextContent('Petar|12');
    await s.lastSave!({ first_name: 'Petar', last_name: 'P', position: 'zidar', work_hours: 8, hourly_rate: 12, work_start_time: '08:00', work_end_time: '16:00' });
    expect(s.addWorker).toHaveBeenCalled();
    expect(s.attach).toHaveBeenCalledWith('new', 'w');
    expect(s.link).toHaveBeenCalledWith('new', 'p');
    expect(onDone).toHaveBeenCalled();
  });
});
