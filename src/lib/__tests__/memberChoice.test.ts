import { describe, it, expect } from 'vitest';
import {
  buildMemberChoices,
  memberChoiceContext,
  memberChoiceLabel,
  ownInvitationEmails,
  type MemberChoiceSource,
} from '@/lib/memberChoice';

const UUID = '11111111-1111-1111-1111-111111111111';
const OWNER = '99999999-9999-9999-9999-999999999999';
const PERSON = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_PERSON = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const labels = {
  noName: 'Bez imena',
  noNameInvited: (d: string) => `Bez imena · pozvan ${d}`,
};

const src = (over: Partial<MemberChoiceSource> = {}): MemberChoiceSource => ({
  userId: UUID,
  displayName: null,
  projectIds: [],
  ...over,
});

describe('memberChoice', () => {
  it('član bez imena nikad ne prikazuje uuid', () => {
    const [c] = buildMemberChoices([src()], {}, PERSON);
    const label = memberChoiceLabel(c, labels);
    expect(label).toBe('Bez imena');
    expect(label).not.toContain(UUID);
    expect(memberChoiceContext(c)).not.toContain(UUID);
  });

  it('bez imena, ali s datumom poziva — prikazuje datum', () => {
    const [c] = buildMemberChoices([src({ invitedAt: '2026-08-01' })], {}, PERSON);
    expect(memberChoiceLabel(c, labels)).toBe('Bez imena · pozvan 2026-08-01');
  });

  it('bez imena, s dopuštenim e-mailom — e-mail je natpis', () => {
    const [c] = buildMemberChoices([src({ invitedEmail: 'p@x.hr' })], {}, PERSON);
    expect(memberChoiceLabel(c, labels)).toBe('p@x.hr');
  });

  it('e-mail se prikazuje samo za pozivnicu koju je poslao sam vlasnik', () => {
    const map = ownInvitationEmails(
      [
        { invited_user_id: UUID, invited_by: OWNER, email: 'moj@x.hr', created_at: '2026-08-01' },
        { invited_user_id: 'zzz', invited_by: 'netko-drugi', email: 'tudi@x.hr', created_at: '2026-08-02' },
      ],
      OWNER,
    );
    expect(map.get(UUID)?.email).toBe('moj@x.hr');
    expect(map.has('zzz')).toBe(false);
  });

  it('član već povezan s drugom osobom je onemogućen i označen', () => {
    const [c] = buildMemberChoices(
      [src({ displayName: 'Petar', linkedPersonId: OTHER_PERSON, linkedPersonName: 'Petar Perić' })],
      {},
      PERSON,
    );
    expect(c.disabled).toBe(true);
    expect(c.blockedByPersonName).toBe('Petar Perić');
  });

  it('veza s TRENUTNOM osobom ne onemogućuje odabir', () => {
    const [c] = buildMemberChoices(
      [src({ displayName: 'Petar', linkedPersonId: PERSON, linkedPersonName: 'Petar' })],
      {},
      PERSON,
    );
    expect(c.disabled).toBe(false);
  });

  it('popis projekata uz člana odgovara stvarnom članstvu', () => {
    const [c] = buildMemberChoices(
      [src({ displayName: 'Vinka', projectIds: ['p2', 'p1', 'p1', 'pX'] })],
      { p1: 'Solin', p2: 'Duje i Dunja' },
      PERSON,
    );
    expect(c.projects).toEqual(['Duje i Dunja', 'Solin']);
    expect(memberChoiceContext(c)).toBe('Duje i Dunja · Solin');
  });

  it('kontekst spaja e-mail i projekte kad ime postoji', () => {
    const [c] = buildMemberChoices(
      [src({ displayName: 'Vinka', invitedEmail: 'v@x.hr', projectIds: ['p1'] })],
      { p1: 'Solin' },
      PERSON,
    );
    expect(memberChoiceContext(c)).toBe('v@x.hr · Solin');
  });
});
