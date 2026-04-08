import { describe, it, expect } from 'vitest';
import { SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers';

describe('subscriptionTiers', () => {
  it('exports defined tiers', () => {
    expect(SUBSCRIPTION_TIERS).toBeDefined();
    expect(typeof SUBSCRIPTION_TIERS).toBe('object');
  });

  it('free tier has expected limits', () => {
    const free = SUBSCRIPTION_TIERS.free;
    expect(free).toBeDefined();
    expect(typeof free.maxExpenses).toBe('number');
    expect(free.maxExpenses).toBeGreaterThan(0);
  });
});
