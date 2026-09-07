import { describe, expect, it } from 'vitest';
import { resolveSignupIntent } from '@/lib/signupIntent';

describe('resolveSignupIntent', () => {
  it('vraća projects iz user metadata', () => {
    expect(resolveSignupIntent({ user_metadata: { signup_intent: 'projects' } }, {})).toBe('projects');
  });

  it('vraća projects iz entry_path (Google/Apple u istom tabu)', () => {
    expect(resolveSignupIntent(null, { entry_path: '/projekti' })).toBe('projects');
    expect(resolveSignupIntent(null, { entry_path: '/projekti?utm_source=x' })).toBe('projects');
  });

  it('vraća finance kad su oba izvora prazna', () => {
    expect(resolveSignupIntent({ user_metadata: {} }, {})).toBe('finance');
    expect(resolveSignupIntent(undefined, undefined)).toBe('finance');
  });

  it('vraća finance za null usera i nevezanu putanju', () => {
    expect(resolveSignupIntent(null, { entry_path: '/' })).toBe('finance');
    expect(resolveSignupIntent(null, { entry_path: '/projekt-nesto' })).toBe('finance');
    expect(resolveSignupIntent(null, null)).toBe('finance');
  });
});
