import { describe, it, expect } from 'vitest';
import { isProjectWriteAllowed, isProjectReadOnly } from '@/lib/projectWriteGuard';
import { deriveProjectPermissions } from '@/lib/projectRolePermissions';

/**
 * Korak D — matrica prava pisanja po ulogama.
 * Vlasnik: sve. Voditelj (member): napredak, ne iznosi. Viewer/investor: ništa.
 * Worker: ništa novo (samo vlastiti radni zapisi, pokriveno allowOwnWorkLog).
 */
describe('Korak D — write matrix (pure guard)', () => {
  it('vlasnik s pretplatom smije sve', () => {
    expect(isProjectWriteAllowed({ accessLevel: 'owner_subscriber' })).toBe(true);
  });

  it('vlasnik bez pretplate je blokiran i za napredak', () => {
    expect(
      isProjectWriteAllowed({
        accessLevel: 'owner_readonly',
        role: 'owner',
        allowMemberProgress: true,
      }),
    ).toBe(false);
  });

  it('voditelj smije upisati napredak kad je opt-in uključen', () => {
    expect(
      isProjectWriteAllowed({ accessLevel: 'participant', role: 'member', allowMemberProgress: true }),
    ).toBe(true);
  });

  it('voditelj bez opt-ina (npr. brisanje faze) ostaje blokiran', () => {
    expect(isProjectWriteAllowed({ accessLevel: 'participant', role: 'member' })).toBe(false);
  });

  it.each(['viewer', 'investor', 'worker'] as const)('%s ne smije pisati napredak', (role) => {
    expect(
      isProjectWriteAllowed({ accessLevel: 'participant', role, allowMemberProgress: true }),
    ).toBe(false);
    expect(
      isProjectReadOnly({ accessLevel: 'participant', role, allowMemberProgress: true }),
    ).toBe(true);
  });

  it('worker i dalje smije vlastiti radni zapis', () => {
    expect(
      isProjectWriteAllowed({ accessLevel: 'participant', role: 'worker', allowOwnWorkLog: true }),
    ).toBe(true);
  });
});

describe('Korak D — granularne dozvole faza', () => {
  it('vlasnik smije i napredak i iznose', () => {
    const p = deriveProjectPermissions({ role: 'owner', isOwner: true });
    expect(p.canEditMilestoneProgress).toBe(true);
    expect(p.canEditMilestoneAmounts).toBe(true);
  });

  it('voditelj smije napredak, ne i iznose', () => {
    const p = deriveProjectPermissions({ role: 'member', isOwner: false });
    expect(p.canEditMilestoneProgress).toBe(true);
    expect(p.canEditMilestoneAmounts).toBe(false);
  });

  it.each(['viewer', 'worker'] as const)('%s ne smije ni napredak ni iznose', (role) => {
    const p = deriveProjectPermissions({ role, isOwner: false });
    expect(p.canEditMilestoneProgress).toBe(false);
    expect(p.canEditMilestoneAmounts).toBe(false);
  });
});
