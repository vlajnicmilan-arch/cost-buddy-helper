import { describe, it, expect } from 'vitest';
import { isSessionGone, isSessionMismatch, shouldWarnOnRetry } from '@/lib/sessionGone';

const session = (id: string | null) => async () => ({
  data: { session: id ? { user: { id } } : null },
});

describe('isSessionMismatch', () => {
  it('bez očekivanog korisnika nije nesklad', () => {
    expect(isSessionMismatch(null, null)).toBe(false);
  });
  it('nestala ili promijenjena sesija je nesklad', () => {
    expect(isSessionMismatch('u1', null)).toBe(true);
    expect(isSessionMismatch('u1', 'u2')).toBe(true);
    expect(isSessionMismatch('u1', 'u1')).toBe(false);
  });
});

describe('isSessionGone', () => {
  it('sinkroni ref koji se ne poklapa → sesija je nestala', async () => {
    await expect(isSessionGone('u1', { liveUserId: null, getSession: session('u1') })).resolves.toBe(true);
  });

  it('nema sesije na posluživaču → nestala', async () => {
    await expect(isSessionGone('u1', { getSession: session(null) })).resolves.toBe(true);
  });

  it('drugi korisnik → nestala', async () => {
    await expect(isSessionGone('u1', { getSession: session('u2') })).resolves.toBe(true);
  });

  it('ista sesija → nije nestala (greška se i dalje prijavljuje)', async () => {
    await expect(isSessionGone('u1', { liveUserId: 'u1', getSession: session('u1') })).resolves.toBe(false);
  });

  it('greška čitanja sesije ne guta poruku', async () => {
    await expect(
      isSessionGone('u1', {
        getSession: async () => {
          throw new Error('boom');
        },
      }),
    ).resolves.toBe(false);
  });
});

describe('shouldWarnOnRetry', () => {
  it('prvi pokušaj online je tih', () => {
    expect(shouldWarnOnRetry(1, true)).toBe(false);
  });
  it('prvi pokušaj offline upozorava', () => {
    expect(shouldWarnOnRetry(1, false)).toBe(true);
  });
  it('drugi pokušaj upozorava i online', () => {
    expect(shouldWarnOnRetry(2, true)).toBe(true);
  });
});
