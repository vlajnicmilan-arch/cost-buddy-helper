import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  startVerificationAutoLogin,
  AUTO_LOGIN_POLL_MS,
} from '@/lib/verificationAutoLogin';

const creds = () => ({ email: 'mirko@test.hr', password: 'Tajna123' });
const notConfirmed = { error: { message: 'Email not confirmed' } };

describe('tihi auto-login na ekranu "Provjerite svoj email"', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('(a) pokušava svakih 15 s dok potvrda ne stigne', async () => {
    const signIn = vi.fn()
      .mockResolvedValueOnce(notConfirmed)
      .mockResolvedValueOnce(notConfirmed)
      .mockResolvedValueOnce({ error: null });
    const stop = startVerificationAutoLogin({ getCredentials: creds, signIn });

    expect(signIn).toHaveBeenCalledTimes(0);
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(AUTO_LOGIN_POLL_MS);
    }
    expect(signIn).toHaveBeenCalledTimes(3);
    expect(signIn).toHaveBeenCalledWith('mirko@test.hr', 'Tajna123');

    // Uspjeh zaustavlja polling.
    await vi.advanceTimersByTimeAsync(AUTO_LOGIN_POLL_MS * 3);
    expect(signIn).toHaveBeenCalledTimes(3);
    stop();
  });

  it('(b) prekid (unmount) zaustavlja polling', async () => {
    const signIn = vi.fn().mockResolvedValue(notConfirmed);
    const stop = startVerificationAutoLogin({ getCredentials: creds, signIn });
    await vi.advanceTimersByTimeAsync(AUTO_LOGIN_POLL_MS);
    expect(signIn).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(AUTO_LOGIN_POLL_MS * 5);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('(c) nakon 10 minuta polling prestaje', async () => {
    const signIn = vi.fn().mockResolvedValue(notConfirmed);
    const stop = startVerificationAutoLogin({ getCredentials: creds, signIn });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    const afterTenMinutes = signIn.mock.calls.length;
    expect(afterTenMinutes).toBe(39); // 600s / 15s, zadnji tik je već izvan roka
    await vi.advanceTimersByTimeAsync(AUTO_LOGIN_POLL_MS * 5);
    expect(signIn).toHaveBeenCalledTimes(afterTenMinutes);
    stop();
  });

  it('bilo koja druga greška tiho prekida polling', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const stop = startVerificationAutoLogin({ getCredentials: creds, signIn });
    await vi.advanceTimersByTimeAsync(AUTO_LOGIN_POLL_MS * 4);
    expect(signIn).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('(d) uvjeti pokretanja i tišina u Auth.tsx', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/pages/Auth.tsx'), 'utf8');
  const effect = src.slice(
    src.indexOf('startVerificationAutoLogin({'),
    src.indexOf('}, [awaitingVerification, verifyEntry]);'),
  );
  const guard = src.slice(
    src.indexOf("if (!awaitingVerification || verifyEntry !== 'signup') return;"),
    src.indexOf('startVerificationAutoLogin({'),
  );

  it('polling se ne pokreće izvan signup ulaza ni bez lozinke', () => {
    expect(guard).toContain("verifyEntry !== 'signup'");
    expect(guard).toContain('credsRef.current.password.trim()');
  });

  it('pokušaj je tih — bez toastova i bez telemetrije', () => {
    expect(effect).not.toContain('showError');
    expect(effect).not.toContain('showSuccess');
    expect(effect).not.toContain('track(');
    expect(effect).not.toContain('failed_login_');
  });

  it('verify_screen_viewed nosi auto_login zastavicu, bez novih imena događaja', () => {
    expect(src).toContain("track('verify_screen_viewed', { entry: verifyEntry, auto_login: autoLoginArmed })");
  });
});
