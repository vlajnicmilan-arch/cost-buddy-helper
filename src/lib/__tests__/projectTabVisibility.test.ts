import { describe, it, expect } from 'vitest';
import { resolveProjectTabVisibility } from '../projectTabVisibility';

const base = {
  isWorkerOnly: false,
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
