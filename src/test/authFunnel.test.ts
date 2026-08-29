import { describe, it, expect } from 'vitest';
import { sanitizeAuthError, resolveInitialAuthTab } from '@/lib/authFunnel';
import { deviceTypeFromWidth, pickPageReadyMs } from '@/lib/landingTelemetry';

describe('sanitizeAuthError', () => {
  it('never leaks an e-mail address', () => {
    const out = sanitizeAuthError({
      code: 'user_already_exists',
      status: 400,
      message: 'User ivan.horvat@example.com already registered',
    });
    expect(out.error_message).not.toContain('@example.com');
    expect(out.error_message).toContain('[email]');
    expect(out.error_code).toBe('user_already_exists');
    expect(out.error_status).toBe(400);
  });

  it('handles missing error data', () => {
    expect(sanitizeAuthError(null)).toEqual({
      error_code: 'unknown',
      error_status: null,
      error_message: '',
    });
  });

  it('truncates long messages', () => {
    const out = sanitizeAuthError({ message: 'x'.repeat(500) });
    expect(out.error_message.length).toBe(200);
  });
});

describe('resolveInitialAuthTab', () => {
  it('opens registration for ?mode=signup', () => {
    expect(resolveInitialAuthTab('?mode=signup')).toBe('register');
  });
  it('opens registration for router state', () => {
    expect(resolveInitialAuthTab('', 'signup')).toBe('register');
  });
  it('defaults to login', () => {
    expect(resolveInitialAuthTab('')).toBe('login');
    expect(resolveInitialAuthTab('?utm_source=fb')).toBe('login');
  });
});

describe('landing page_ready helpers', () => {
  it('prefers LCP over fallback', () => {
    expect(pickPageReadyMs(1234.6, 900)).toBe(1235);
    expect(pickPageReadyMs(null, 900)).toBe(900);
    expect(pickPageReadyMs(null, null)).toBeNull();
    expect(pickPageReadyMs(0, 0)).toBeNull();
  });

  it('buckets device by viewport width', () => {
    expect(deviceTypeFromWidth(384)).toBe('mobile');
    expect(deviceTypeFromWidth(800)).toBe('tablet');
    expect(deviceTypeFromWidth(1440)).toBe('desktop');
    expect(deviceTypeFromWidth(0)).toBe('desktop');
  });
});
