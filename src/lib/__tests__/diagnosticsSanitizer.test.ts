import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeRoute,
  sanitizeConsoleEntries,
  sanitizeDiagnostics,
} from '@/lib/diagnosticsSanitizer';

describe('diagnosticsSanitizer', () => {
  it('redacts email addresses', () => {
    expect(sanitizeString('kontakt vlasnik@vmbalance.com danas')).toBe(
      'kontakt [email] danas',
    );
  });

  it('redacts long digit runs (IBAN / card / phone)', () => {
    expect(sanitizeString('HR1234567890123456 kartica 4111111111111111')).toBe(
      'HR[num] kartica [num]',
    );
    // short numbers left alone
    expect(sanitizeString('greška 42 puta')).toBe('greška 42 puta');
  });

  it('redacts UUIDs', () => {
    expect(
      sanitizeString('project 550e8400-e29b-41d4-a716-446655440000 err'),
    ).toBe('project [id] err');
  });

  it('redacts bearer + token key/value + JWT-shape strings', () => {
    expect(sanitizeString('Authorization: Bearer abcdef1234567890'))
      .toBe('Authorization: Bearer [token]');
    expect(sanitizeString('access_token=abcdef1234567890XYZ')).toBe(
      'access_token=[token]',
    );
    expect(
      sanitizeString('eyJhbGciOi.eyJzdWIiOi.SflKxwRJSMeK abc'),
    ).toContain('[token]');
  });

  it('sanitizeRoute strips uuid segments and long digit runs', () => {
    expect(
      sanitizeRoute('/projects/550e8400-e29b-41d4-a716-446655440000/tabs'),
    ).toBe('/projects/[id]/tabs');
    expect(sanitizeRoute('/wallet/1234567')).toBe('/wallet/[num]');
  });

  it('sanitizes console_tail entries', () => {
    const out = sanitizeConsoleEntries([
      { level: 'error', message: 'user vlasnik@vmbalance.com failed', t: 1 },
    ]);
    expect(out[0].message).toBe('user [email] failed');
    expect(out[0].level).toBe('error');
    expect(out[0].t).toBe(1);
  });

  it('sanitizeDiagnostics preserves user_agent, strips route/console', () => {
    const out = sanitizeDiagnostics({
      route: '/p/550e8400-e29b-41d4-a716-446655440000',
      app_version: '1.2.3',
      language: 'hr',
      viewport: '384x800@2',
      platform: 'Android',
      user_agent: 'Mozilla/5.0 (Linux; Android 14; Pixel)',
      console_tail: [
        { level: 'warn', message: 'IBAN HR1234567890123456', t: 1 },
      ],
    });
    expect(out.route).toBe('/p/[id]');
    expect(out.user_agent).toContain('Mozilla');
    expect(out.console_tail[0].message).toBe('IBAN HR[num]');
  });
});
