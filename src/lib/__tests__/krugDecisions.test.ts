import { describe, it, expect } from 'vitest';
import {
  decideSetPrivacy,
  decideApplyAct,
  decideWithdraw,
  decideRetract,
  decideGovernToPersonal,
  parseSharedSourceRef,
  canManageSharedSource,
  type SetPrivacyInput,
  type ApplyActInput,
  type WithdrawInput,
  type RetractInput,
  type GovernToPersonalInput,
} from '@/lib/krugDecisions';

// Bazni "happy path" objekti koje testovi mutiraju samo u relevantnim poljima.
const baseSet: SetPrivacyInput = {
  authenticated: true,
  expenseFound: true,
  hasKrugContext: true,
  isAuthor: true,
  isFullMember: true,
  prevPrivacy: 'personal',
  prevStatus: null,
  newPrivacy: 'shared',
};

const baseAct: ApplyActInput = {
  authenticated: true,
  expenseFound: true,
  inSharedFlow: true,
  isAuthor: false,
  isFullMember: true,
  prevStatus: 'predlozena',
  act: 'A1',
  clientRequestId: 'req-1',
};

const baseWithdraw: WithdrawInput = {
  authenticated: true,
  expenseFound: true,
  alreadyDeleted: false,
  isAuthor: true,
  inSharedFlow: true,
  isFullMember: true,
  prevStatus: 'predlozena',
  clientRequestId: 'req-1',
};

describe('decideSetPrivacy — guards', () => {
  it('unauth', () => {
    expect(decideSetPrivacy({ ...baseSet, authenticated: false })).toBe('unauthenticated');
  });
  it('not_found prije ostalog', () => {
    expect(decideSetPrivacy({ ...baseSet, expenseFound: false })).toBe('not_found');
  });
  it('not_in_krug_context', () => {
    expect(decideSetPrivacy({ ...baseSet, hasKrugContext: false })).toBe('not_in_krug_context');
  });
  it('not_author', () => {
    expect(decideSetPrivacy({ ...baseSet, isAuthor: false })).toBe('not_author');
  });
});

describe('decideSetPrivacy — tranzicije iz personal/private', () => {
  it('personal → private = ok_set_private', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'personal', newPrivacy: 'private' })).toBe('ok_set_private');
  });
  it('private → personal = ok_set_personal', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'private', newPrivacy: 'personal' })).toBe('ok_set_personal');
  });
  it('personal → shared, full member = ok_proposed_shared', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'personal', newPrivacy: 'shared' })).toBe('ok_proposed_shared');
  });
  it('private → shared, full member = ok_proposed_shared', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'private', newPrivacy: 'shared' })).toBe('ok_proposed_shared');
  });
  it('personal → shared, OBIČNI član = not_full_member', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'personal', newPrivacy: 'shared', isFullMember: false })).toBe('not_full_member');
  });
});

describe('decideSetPrivacy — idempotencija i shared lock (A7 = Wave 1.5)', () => {
  it('personal → personal = noop', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'personal', newPrivacy: 'personal' })).toBe('noop_already_in_target_state');
  });
  it('private → private = noop', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'private', newPrivacy: 'private' })).toBe('noop_already_in_target_state');
  });
  it('shared/predlozena → shared = noop', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'shared', prevStatus: 'predlozena', newPrivacy: 'shared' })).toBe('noop_already_in_target_state');
  });
  it('shared/potvrdjena → shared NIJE noop nego wrong_state (A5 ide kroz krug_apply_act, ne ovdje)', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'shared', prevStatus: 'potvrdjena', newPrivacy: 'shared' })).toBe('wrong_state');
  });
  it('shared → personal = wrong_state (to je A7, Wave 1.5)', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'shared', prevStatus: 'predlozena', newPrivacy: 'personal' })).toBe('wrong_state');
  });
  it('shared → private = wrong_state', () => {
    expect(decideSetPrivacy({ ...baseSet, prevPrivacy: 'shared', prevStatus: 'potvrdjena', newPrivacy: 'private' })).toBe('wrong_state');
  });
});

describe('decideApplyAct — guards i invalid_act', () => {
  it('unauth', () => {
    expect(decideApplyAct({ ...baseAct, authenticated: false })).toBe('unauthenticated');
  });
  it('nepoznat act', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A9' as any })).toBe('invalid_act');
  });
  it('missing client_request_id (prazno)', () => {
    expect(decideApplyAct({ ...baseAct, clientRequestId: '' })).toBe('missing_client_request_id');
  });
  it('missing client_request_id (null)', () => {
    expect(decideApplyAct({ ...baseAct, clientRequestId: null })).toBe('missing_client_request_id');
  });
  it('not_found prije inSharedFlow', () => {
    expect(decideApplyAct({ ...baseAct, expenseFound: false })).toBe('not_found');
  });
  it('not_in_shared_flow (personal ili krug_id NULL)', () => {
    expect(decideApplyAct({ ...baseAct, inSharedFlow: false })).toBe('not_in_shared_flow');
  });
});

describe('decideApplyAct — A1 / A2 governance', () => {
  it('A1 autor ne smije = author_cannot_govern', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A1', isAuthor: true })).toBe('author_cannot_govern');
  });
  it('A2 autor ne smije = author_cannot_govern', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A2', isAuthor: true })).toBe('author_cannot_govern');
  });
  it('A1 obični član = not_full_member', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A1', isFullMember: false })).toBe('not_full_member');
  });
  it('A1 nad potvrdjena = wrong_state', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A1', prevStatus: 'potvrdjena' })).toBe('wrong_state');
  });
  it('A1 nad predlozena = ok_confirmed', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A1' })).toBe('ok_confirmed');
  });
  it('A2 nad predlozena = ok_negated', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A2' })).toBe('ok_negated');
  });
});

describe('decideApplyAct — A5 autor re-propose', () => {
  it('A5 ne-autor = not_author', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A5', isAuthor: false })).toBe('not_author');
  });
  it('A5 obični član autor = not_full_member', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A5', isAuthor: true, isFullMember: false })).toBe('not_full_member');
  });
  it('A5 nad predlozena = wrong_state', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A5', isAuthor: true, prevStatus: 'predlozena' })).toBe('wrong_state');
  });
  it('A5 nad potvrdjena = ok_reproposed', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A5', isAuthor: true, prevStatus: 'potvrdjena' })).toBe('ok_reproposed');
  });
  it('A5 nad nepotvrdjena = ok_reproposed', () => {
    expect(decideApplyAct({ ...baseAct, act: 'A5', isAuthor: true, prevStatus: 'nepotvrdjena' })).toBe('ok_reproposed');
  });
});

describe('decideWithdraw — A4', () => {
  it('unauth', () => {
    expect(decideWithdraw({ ...baseWithdraw, authenticated: false })).toBe('unauthenticated');
  });
  it('missing client_request_id', () => {
    expect(decideWithdraw({ ...baseWithdraw, clientRequestId: '' })).toBe('missing_client_request_id');
  });
  it('not_found', () => {
    expect(decideWithdraw({ ...baseWithdraw, expenseFound: false })).toBe('not_found');
  });
  it('already soft-deleted = noop', () => {
    expect(decideWithdraw({ ...baseWithdraw, alreadyDeleted: true })).toBe('noop_already_in_target_state');
  });
  it('ne-autor = not_author', () => {
    expect(decideWithdraw({ ...baseWithdraw, isAuthor: false })).toBe('not_author');
  });
  it('ne u shared toku = not_in_shared_flow', () => {
    expect(decideWithdraw({ ...baseWithdraw, inSharedFlow: false })).toBe('not_in_shared_flow');
  });
  it('obični član autor = not_full_member', () => {
    expect(decideWithdraw({ ...baseWithdraw, isFullMember: false })).toBe('not_full_member');
  });
  it('potvrdjena = wrong_state (A4 samo nad predlozena)', () => {
    expect(decideWithdraw({ ...baseWithdraw, prevStatus: 'potvrdjena' })).toBe('wrong_state');
  });
  it('nepotvrdjena = wrong_state', () => {
    expect(decideWithdraw({ ...baseWithdraw, prevStatus: 'nepotvrdjena' })).toBe('wrong_state');
  });
  it('predlozena + autor + full = ok_withdrawn', () => {
    expect(decideWithdraw(baseWithdraw)).toBe('ok_withdrawn');
  });
});

describe('parseSharedSourceRef', () => {
  it('custom:UUID', () => {
    const r = parseSharedSourceRef('custom:11111111-2222-3333-4444-555555555555');
    expect(r).toEqual({ kind: 'custom', uuid: '11111111-2222-3333-4444-555555555555' });
  });
  it('custom: s neispravnim UUID = invalid', () => {
    expect(parseSharedSourceRef('custom:not-a-uuid').kind).toBe('invalid');
  });
  it('builtin slug', () => {
    expect(parseSharedSourceRef('cash')).toEqual({ kind: 'builtin', slug: 'cash' });
  });
  it('prazan string = invalid', () => {
    expect(parseSharedSourceRef('').kind).toBe('invalid');
  });
});

describe('canManageSharedSource', () => {
  const custom = parseSharedSourceRef('custom:11111111-2222-3333-4444-555555555555');
  const builtin = parseSharedSourceRef('cash');
  const invalid = parseSharedSourceRef('custom:bad');

  it('ne-owner kruga nikad ne smije', () => {
    expect(canManageSharedSource(custom, false, true)).toBe(false);
    expect(canManageSharedSource(builtin, false, false)).toBe(false);
  });
  it('owner kruga + owner custom izvora = ok', () => {
    expect(canManageSharedSource(custom, true, true)).toBe(true);
  });
  it('owner kruga ali NE owner custom izvora = ne', () => {
    expect(canManageSharedSource(custom, true, false)).toBe(false);
  });
  it('owner kruga + builtin slug = ok (bez provjere source ownera)', () => {
    expect(canManageSharedSource(builtin, true, false)).toBe(true);
  });
  it('invalid ref nikad ne prolazi', () => {
    expect(canManageSharedSource(invalid, true, true)).toBe(false);
  });
});

// ============================================================================
// Wave 1.5 — A3 retract
// ============================================================================

const baseRetract: RetractInput = {
  authenticated: true,
  expenseFound: true,
  alreadyDeleted: false,
  isAuthor: true,
  inSharedFlow: true,
  isFullMember: true,
  prevStatus: 'predlozena',
  clientRequestId: 'req-1',
};

describe('decideRetract (A3)', () => {
  it('happy path → ok_retracted', () => {
    expect(decideRetract(baseRetract)).toBe('ok_retracted');
  });
  it('unauth', () => {
    expect(decideRetract({ ...baseRetract, authenticated: false })).toBe('unauthenticated');
  });
  it('missing request id', () => {
    expect(decideRetract({ ...baseRetract, clientRequestId: '' })).toBe('missing_client_request_id');
  });
  it('not found', () => {
    expect(decideRetract({ ...baseRetract, expenseFound: false })).toBe('not_found');
  });
  it('already deleted → not_found (klijent ne zna razliku)', () => {
    expect(decideRetract({ ...baseRetract, alreadyDeleted: true })).toBe('not_found');
  });
  it('ne-autor', () => {
    expect(decideRetract({ ...baseRetract, isAuthor: false })).toBe('not_author');
  });
  it('izvan shared toka', () => {
    expect(decideRetract({ ...baseRetract, inSharedFlow: false })).toBe('not_in_shared_flow');
  });
  it('autor ali obični član', () => {
    expect(decideRetract({ ...baseRetract, isFullMember: false })).toBe('not_full_member');
  });
  it('potvrdjena → wrong_state (A3 samo na predlozena)', () => {
    expect(decideRetract({ ...baseRetract, prevStatus: 'potvrdjena' })).toBe('wrong_state');
  });
  it('nepotvrdjena → wrong_state', () => {
    expect(decideRetract({ ...baseRetract, prevStatus: 'nepotvrdjena' })).toBe('wrong_state');
  });
  it('null status → wrong_state', () => {
    expect(decideRetract({ ...baseRetract, prevStatus: null })).toBe('wrong_state');
  });
});

// ============================================================================
// Wave 1.5 — A7 govern to personal
// ============================================================================

const baseGovern: GovernToPersonalInput = {
  authenticated: true,
  expenseFound: true,
  alreadyDeleted: false,
  inSharedFlow: true,
  isFullMember: true,
  prevStatus: 'potvrdjena',
  clientRequestId: 'req-1',
};

describe('decideGovernToPersonal (A7)', () => {
  it('potvrdjena → ok', () => {
    expect(decideGovernToPersonal(baseGovern)).toBe('ok_governed_to_personal');
  });
  it('nepotvrdjena → ok (post-quorum oba smjera)', () => {
    expect(decideGovernToPersonal({ ...baseGovern, prevStatus: 'nepotvrdjena' })).toBe('ok_governed_to_personal');
  });
  it('predlozena → wrong_state (A7 ne dira pending)', () => {
    expect(decideGovernToPersonal({ ...baseGovern, prevStatus: 'predlozena' })).toBe('wrong_state');
  });
  it('null status → wrong_state', () => {
    expect(decideGovernToPersonal({ ...baseGovern, prevStatus: null })).toBe('wrong_state');
  });
  it('unauth', () => {
    expect(decideGovernToPersonal({ ...baseGovern, authenticated: false })).toBe('unauthenticated');
  });
  it('missing request id', () => {
    expect(decideGovernToPersonal({ ...baseGovern, clientRequestId: undefined })).toBe('missing_client_request_id');
  });
  it('not found', () => {
    expect(decideGovernToPersonal({ ...baseGovern, expenseFound: false })).toBe('not_found');
  });
  it('already deleted → not_found', () => {
    expect(decideGovernToPersonal({ ...baseGovern, alreadyDeleted: true })).toBe('not_found');
  });
  it('izvan shared toka', () => {
    expect(decideGovernToPersonal({ ...baseGovern, inSharedFlow: false })).toBe('not_in_shared_flow');
  });
  it('obični član ne može', () => {
    expect(decideGovernToPersonal({ ...baseGovern, isFullMember: false })).toBe('not_full_member');
  });
  it('A7 ne traži autora — drugi punopravni član smije', () => {
    // Sanity: nema isAuthor polja u inputu, što je namjerno.
    expect(decideGovernToPersonal(baseGovern)).toBe('ok_governed_to_personal');
  });
});
