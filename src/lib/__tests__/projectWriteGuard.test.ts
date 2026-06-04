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
});
