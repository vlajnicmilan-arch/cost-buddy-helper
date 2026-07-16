import { describe, it, expect } from 'vitest';
import { resolveProjectTabVisibility } from '../projectTabVisibility';

const base = {
  isWorkerOnly: false,
  isInvestorViewer: false,
  isManager: false,
  isTabVisible: () => false,
  canSeeWorkers: true,
  canSeeCollaborators: true,
  hasWorkers: true,
};

describe('resolveProjectTabVisibility', () => {
  it('worker-only role sees only worklog', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'worklog', isWorkerOnly: true })).toBe(true);
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'overview', isWorkerOnly: true })).toBe(false);
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'documents', isWorkerOnly: true })).toBe(false);
  });

  it('investor viewer sees ONLY overview, phases and decisions', () => {
    const inv = { ...base, isInvestorViewer: true, isManager: true };
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'overview' })).toBe(true);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'phases' })).toBe(true);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'milestones' })).toBe(true);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'timeline' })).toBe(true);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'decisions' })).toBe(true);
    // Internal — MUST be hidden
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'budget' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'transactions' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'funding' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'workers' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'collaborators' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'worklog' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'team' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'documents' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'activity' })).toBe(false);
  });

  it('investor gate wins over isManager and isTabVisible grants', () => {
    // Even if some caller passes elevated flags, investor still cannot escape.
    const inv = {
      ...base,
      isInvestorViewer: true,
      isManager: true,
      isTabVisible: () => true,
    };
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'budget' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'transactions' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...inv, tabKey: 'funding' })).toBe(false);
  });

  it('hides workers tab when canSeeWorkers is false', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'workers', canSeeWorkers: false, isManager: true })).toBe(false);
  });

  it('hides collaborators tab when canSeeCollaborators is false', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'collaborators', canSeeCollaborators: false, isManager: true })).toBe(false);
  });

  it('documents is always visible to members', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'documents' })).toBe(true);
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'documents', isManager: false, isTabVisible: () => false })).toBe(true);
  });

  it('worklog hidden when project has no workers', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'worklog', hasWorkers: false, isManager: true })).toBe(false);
  });

  it('worklog visible to manager when workers exist', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'worklog', isManager: true })).toBe(true);
  });

  it('worklog visible to non-manager when explicit permission grants it', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'worklog', isTabVisible: (k) => k === 'worklog' })).toBe(true);
  });

  it('generic tab: manager sees it', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'funding', isManager: true })).toBe(true);
  });

  it('generic tab: non-manager needs explicit permission', () => {
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'funding' })).toBe(false);
    expect(resolveProjectTabVisibility({ ...base, tabKey: 'funding', isTabVisible: (k) => k === 'funding' })).toBe(true);
  });
});
