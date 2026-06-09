import { describe, it, expect } from 'vitest';
import { isProjectWriteAllowed, isProjectReadOnly } from '@/lib/projectWriteGuard';

describe('projectWriteGuard', () => {
  it('blocks when explicit isReadOnly=true', () => {
    expect(isProjectWriteAllowed({ isReadOnly: true })).toBe(false);
    expect(isProjectReadOnly({ isReadOnly: true })).toBe(true);
  });

  it('allows when explicit isReadOnly=false (overrides accessLevel)', () => {
    expect(isProjectWriteAllowed({ isReadOnly: false, accessLevel: 'owner_readonly' })).toBe(true);
  });

  it('allows only owner_subscriber when using accessLevel', () => {
    expect(isProjectWriteAllowed({ accessLevel: 'owner_subscriber' })).toBe(true);
    expect(isProjectWriteAllowed({ accessLevel: 'owner_readonly' })).toBe(false);
    expect(isProjectWriteAllowed({ accessLevel: 'participant' })).toBe(false);
    expect(isProjectWriteAllowed({ accessLevel: 'none' })).toBe(false);
  });

  it('treats missing input as read-only', () => {
    expect(isProjectWriteAllowed({})).toBe(false);
    expect(isProjectWriteAllowed({ accessLevel: null })).toBe(false);
    expect(isProjectWriteAllowed({ isReadOnly: null })).toBe(false);
  });

  describe('allowOwnWorkLog narrow exception', () => {
    it('allows participant when allowOwnWorkLog=true', () => {
      expect(isProjectWriteAllowed({ accessLevel: 'participant', allowOwnWorkLog: true })).toBe(true);
    });

    it('still blocks owner_readonly even with allowOwnWorkLog=true (billing gate)', () => {
      expect(isProjectWriteAllowed({ accessLevel: 'owner_readonly', allowOwnWorkLog: true })).toBe(false);
    });

    it('still blocks none even with allowOwnWorkLog=true', () => {
      expect(isProjectWriteAllowed({ accessLevel: 'none', allowOwnWorkLog: true })).toBe(false);
    });

    it('explicit isReadOnly=true wins over allowOwnWorkLog', () => {
      expect(isProjectWriteAllowed({ isReadOnly: true, allowOwnWorkLog: true })).toBe(false);
    });
  });
});
