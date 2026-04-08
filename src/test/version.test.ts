import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '@/lib/version';

describe('APP_VERSION', () => {
  it('is a valid semver-like string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
