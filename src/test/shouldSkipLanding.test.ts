import { describe, it, expect } from 'vitest';
import { shouldSkipLanding } from '@/lib/appOrigin';

describe('shouldSkipLanding', () => {
  it('skips landing on app.vmbalance.com without a user', () => {
    expect(shouldSkipLanding('app.vmbalance.com', null)).toBe(true);
    expect(shouldSkipLanding('app.vmbalance.com', undefined)).toBe(true);
  });

  it('does not skip landing on app.vmbalance.com when a user is signed in', () => {
    expect(shouldSkipLanding('app.vmbalance.com', { id: 'u1' })).toBe(false);
  });

  it('does not skip landing on the marketing domain', () => {
    expect(shouldSkipLanding('vmbalance.com', null)).toBe(false);
    expect(shouldSkipLanding('www.vmbalance.com', null)).toBe(false);
  });

  it('does not skip landing on preview hosts', () => {
    expect(shouldSkipLanding('id-preview--8a8fc612-0ac2-4902-a82e-29b5b800bc32.lovable.app', null)).toBe(false);
    expect(shouldSkipLanding('localhost', null)).toBe(false);
  });
});
