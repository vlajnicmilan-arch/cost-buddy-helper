import { describe, it, expect } from 'vitest';
import { TIERS, TRIAL_DURATION_DAYS, isTrialExpired, getTrialDaysRemaining } from '@/lib/subscriptionTiers';

describe('subscriptionTiers', () => {
  it('exports defined tiers', () => {
    expect(TIERS).toBeDefined();
    expect(TIERS.pro).toBeDefined();
    expect(TIERS.business).toBeDefined();
  });

  it('pro tier has monthly and yearly prices', () => {
    expect(TIERS.pro.prices.monthly.amount).toBeGreaterThan(0);
    expect(TIERS.pro.prices.yearly.amount).toBeGreaterThan(0);
  });

  it('trial duration is positive', () => {
    expect(TRIAL_DURATION_DAYS).toBeGreaterThan(0);
  });

  it('isTrialExpired returns false for recent date', () => {
    expect(isTrialExpired(new Date().toISOString())).toBe(false);
  });

  it('isTrialExpired returns true for old date', () => {
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    expect(isTrialExpired(old)).toBe(true);
  });

  it('getTrialDaysRemaining returns correct value', () => {
    const remaining = getTrialDaysRemaining(new Date().toISOString());
    expect(remaining).toBeGreaterThanOrEqual(TRIAL_DURATION_DAYS - 1);
    expect(remaining).toBeLessThanOrEqual(TRIAL_DURATION_DAYS);
  });
});
