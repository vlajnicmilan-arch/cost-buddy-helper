import { describe, it, expect } from 'vitest';
import {
  MAX_INDIVIDUAL_PER_DAY,
  buildSignupMessage,
  buildSignupPushBody,
  buildSummaryMessage,
  decideSignupDelivery,
  extractUtm,
  formatSignupSource,
  summaryDedupKey,
} from '../../supabase/functions/_shared/adminSignupNotice';

describe('formatSignupSource', () => {
  it('falls back to "izravno" when no UTM tags exist', () => {
    expect(formatSignupSource(null)).toBe('izravno');
    expect(formatSignupSource({})).toBe('izravno');
    expect(formatSignupSource({ utm_source: '  ', utm_medium: null })).toBe('izravno');
  });

  it('maps known source/medium pairs to human labels', () => {
    expect(formatSignupSource({ utm_source: 'facebook', utm_medium: 'cpc' })).toBe(
      'Facebook, plaćeni oglas',
    );
  });

  it('keeps unknown values verbatim and appends the campaign', () => {
    expect(
      formatSignupSource({ utm_source: 'partnerX', utm_medium: 'banner', utm_campaign: 'ljeto26' }),
    ).toBe('partnerX, banner, ljeto26');
  });

  it('extracts UTM tags from funnel metadata safely', () => {
    expect(extractUtm({ utm_source: 'google', other: 1 }).utm_source).toBe('google');
    expect(extractUtm(null)).toEqual({ utm_source: null, utm_medium: null, utm_campaign: null });
    expect(extractUtm({ utm_source: 42 }).utm_source).toBeNull();
  });
});

describe('message building', () => {
  const at = '2026-08-29T07:14:00.000Z';

  it('uses the name when present', () => {
    expect(buildSignupMessage({ displayName: 'Marko M.', occurredAt: at, source: 'Facebook' })).toBe(
      'Marko M. · 09:14 · Facebook',
    );
  });

  it('says "bez imena" when the profile has no name', () => {
    expect(buildSignupMessage({ displayName: null, occurredAt: at, source: 'izravno' })).toBe(
      'bez imena · 09:14 · izravno',
    );
  });

  it('never leaks name or e-mail into the push body', () => {
    const push = buildSignupPushBody('Facebook');
    expect(push).toBe('Nova registracija · Facebook');
    expect(push).not.toContain('Marko');
    expect(push).not.toContain('@');
  });

  it('uses correct Croatian plurals in the summary', () => {
    expect(buildSummaryMessage(1)).toBe('još 1 registracija danas');
    expect(buildSummaryMessage(3)).toBe('još 3 registracije danas');
    expect(buildSummaryMessage(12)).toBe('još 12 registracija danas');
  });

  it('scopes the summary dedup key per day', () => {
    expect(summaryDedupKey('2026-08-29')).toBe('admin_new_signup_summary:2026-08-29');
    expect(summaryDedupKey('2026-08-29')).not.toBe(summaryDedupKey('2026-08-30'));
  });
});

describe('decideSignupDelivery', () => {
  it('sends individual notices for the first five signups of the day', () => {
    for (let i = 0; i < MAX_INDIVIDUAL_PER_DAY; i++) {
      expect(decideSignupDelivery(i, false)).toEqual({ mode: 'individual', push: true });
    }
  });

  it('switches to a single summary from the sixth signup on', () => {
    expect(decideSignupDelivery(5, false)).toEqual({ mode: 'summary_new', push: true });
  });

  it('updates the existing summary without another push', () => {
    expect(decideSignupDelivery(5, true)).toEqual({ mode: 'summary_update', push: false });
    expect(decideSignupDelivery(9, true)).toEqual({ mode: 'summary_update', push: false });
  });
});
