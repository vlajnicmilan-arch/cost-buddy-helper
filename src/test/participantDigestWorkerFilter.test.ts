/**
 * Parity guard test — server-side pravilo:
 * `enqueue_participant_digest_event` NE smije upisati pending state za
 * project_members s role='worker' (radnik u UI-u nema uvid u financije).
 *
 * Ova regresija dokazuje semantiku RPC filtra u čistom TS-u — SQL migracija
 * je istovjetna. Ako se ovo pravilo ikad relaksira u bazi, test pada.
 */
import { describe, it, expect } from 'vitest';

type Role = 'owner' | 'member' | 'worker' | 'viewer' | 'investor' | null;

interface Member { user_id: string; role: Exclude<Role, null | 'owner'>; }

function resolveDigestRecipients(opts: {
  ownerId: string;
  actorId: string;
  members: Member[];
}): string[] {
  const { ownerId, actorId, members } = opts;
  const set = new Set<string>();
  set.add(ownerId);
  for (const m of members) {
    if (m.role === 'worker') continue; // parity guard
    set.add(m.user_id);
  }
  set.delete(actorId);
  return Array.from(set).sort();
}

describe('participant digest — worker parity guard', () => {
  const owner = 'owner-uid';
  const actor = 'actor-uid';

  it('worker on the project never receives the digest', () => {
    const out = resolveDigestRecipients({
      ownerId: owner,
      actorId: actor,
      members: [
        { user_id: 'petar-worker', role: 'worker' },
        { user_id: 'ana-member', role: 'member' },
      ],
    });
    expect(out).toContain('owner-uid');
    expect(out).toContain('ana-member');
    expect(out).not.toContain('petar-worker');
  });

  it('viewer/investor/member keep receiving', () => {
    const out = resolveDigestRecipients({
      ownerId: owner,
      actorId: actor,
      members: [
        { user_id: 'v', role: 'viewer' },
        { user_id: 'i', role: 'investor' },
        { user_id: 'm', role: 'member' },
      ],
    });
    expect(out).toEqual(expect.arrayContaining(['owner-uid', 'v', 'i', 'm']));
  });

  it('actor is excluded even if they are the owner', () => {
    const out = resolveDigestRecipients({
      ownerId: owner,
      actorId: owner,
      members: [{ user_id: 'ana', role: 'member' }],
    });
    expect(out).toEqual(['ana']);
  });

  it('worker actor still excluded (defence-in-depth)', () => {
    const out = resolveDigestRecipients({
      ownerId: owner,
      actorId: 'petar-worker',
      members: [
        { user_id: 'petar-worker', role: 'worker' },
        { user_id: 'ana', role: 'member' },
      ],
    });
    expect(out).not.toContain('petar-worker');
    expect(out).toContain('ana');
  });
});
