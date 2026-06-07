import { describe, it, expect } from 'vitest';
import { resolveLegacyTabAlias } from '../projectTabAliases';

describe('resolveLegacyTabAlias', () => {
  it('maps legacy "members" → team + members sub-tab', () => {
    expect(resolveLegacyTabAlias('members')).toEqual({ tab: 'team', teamSubTab: 'members' });
  });

  it('maps legacy "workers" → team + workers sub-tab', () => {
    expect(resolveLegacyTabAlias('workers')).toEqual({ tab: 'team', teamSubTab: 'workers' });
  });

  it('maps legacy "collaborators" → team + collaborators sub-tab', () => {
    expect(resolveLegacyTabAlias('collaborators')).toEqual({ tab: 'team', teamSubTab: 'collaborators' });
  });

  it('maps legacy "timeline" → phases (no sub-tab)', () => {
    expect(resolveLegacyTabAlias('timeline')).toEqual({ tab: 'phases' });
  });

  it('maps legacy "milestones" → phases (no sub-tab)', () => {
    expect(resolveLegacyTabAlias('milestones')).toEqual({ tab: 'phases' });
  });

  it('passes through canonical "overview" unchanged', () => {
    expect(resolveLegacyTabAlias('overview')).toEqual({ tab: 'overview' });
  });

  it('passes through canonical "funding" unchanged', () => {
    expect(resolveLegacyTabAlias('funding')).toEqual({ tab: 'funding' });
  });

  it('passes through canonical "transactions" unchanged', () => {
    expect(resolveLegacyTabAlias('transactions')).toEqual({ tab: 'transactions' });
  });

  it('passes through canonical "team" with no sub-tab', () => {
    expect(resolveLegacyTabAlias('team')).toEqual({ tab: 'team' });
  });

  it('passes through unknown keys (identity fallback)', () => {
    expect(resolveLegacyTabAlias('something-new')).toEqual({ tab: 'something-new' });
    expect(resolveLegacyTabAlias('')).toEqual({ tab: '' });
  });
});
