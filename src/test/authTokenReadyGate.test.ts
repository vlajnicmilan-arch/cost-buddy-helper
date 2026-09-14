/**
 * Hladno otvaranje: dohvat ne smije krenuti sa starim tokenom, a ako ga
 * pretekne, ne smije čekati puni rok ni paliti žutu traku.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isTokenValid,
  markTokenReady,
  markTokenRefreshed,
  startedBeforeTokenReady,
  tokenAgeSeconds,
  waitedForAuthMs,
  __resetAuthTokenReadyForTests,
} from '@/lib/authTokenReady';
import { loadWithRetry, __resetInFlightLoadsForTests } from '@/lib/loadWithRetry';
import { __resetWeakConnection, getWeakConnectionState } from '@/lib/weakConnection';

vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: () => {} }));

describe('isTokenValid', () => {
  const now = 1_000_000_000_000;
  it('istekao token nije valjan', () => {
    expect(isTokenValid(now / 1000 - 10, now)).toBe(false);
  });
  it('token koji ističe za manje od 60 s nije valjan', () => {
    expect(isTokenValid(now / 1000 + 30, now)).toBe(false);
  });
  it('svjež token je valjan', () => {
    expect(isTokenValid(now / 1000 + 600, now)).toBe(true);
  });
  it('bez expires_at nije valjan', () => {
    expect(isTokenValid(undefined, now)).toBe(false);
    expect(isTokenValid(null, now)).toBe(false);
  });
});

describe('trenuci spremnosti tokena', () => {
  beforeEach(() => __resetAuthTokenReadyForTests());

  it('zahtjev prije spremnosti tokena je prepoznat, kasniji nije', () => {
    markTokenReady(1000);
    expect(startedBeforeTokenReady(500)).toBe(true);
    expect(startedBeforeTokenReady(1500)).toBe(false);
    expect(waitedForAuthMs(500)).toBe(500);
    expect(waitedForAuthMs(1500)).toBe(0);
  });

  it('starost tokena se računa od zadnjeg osvježenja', () => {
    markTokenRefreshed(10_000);
    expect(tokenAgeSeconds(13_000)).toBe(3);
  });
});

describe('loadWithRetry u boot prozoru', () => {
  beforeEach(() => {
    __resetAuthTokenReadyForTests();
    __resetInFlightLoadsForTests();
    __resetWeakConnection();
  });

  it('zahtjev pokrenut prije osvježenja koji pukne — odmah ponovljen, bez trake', async () => {
    let attempts = 0;
    const started = Date.now();
    const promise = loadWithRetry('probe', async () => {
      attempts += 1;
      if (attempts === 1) {
        // Token se osvježi dok prvi zahtjev visi.
        markTokenRefreshed();
        markTokenReady(started + 1);
        throw Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });
      }
      return 'ok';
    });
    await expect(promise).resolves.toBe('ok');
    expect(attempts).toBe(2);
    expect(getWeakConnectionState().active).toBe(false);
  });

  it('svjež token: prolazni pad i dalje pali traku', async () => {
    markTokenReady(Date.now() - 10_000);
    let attempts = 0;
    const promise = loadWithRetry('probe2', async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });
      }
      return 'ok';
    });
    // Traka se pali prije čekanja razmaka.
    await vi.waitFor(() => expect(getWeakConnectionState().active).toBe(true));
    await expect(promise).resolves.toBe('ok');
    expect(attempts).toBe(2);
    expect(getWeakConnectionState().active).toBe(false);
  }, 10_000);

  it('zahtjev se prekida čim se token osvježi, bez čekanja roka', async () => {
    let attempts = 0;
    const promise = loadWithRetry(
      'probe3',
      (signal) =>
        new Promise<string>((resolve, reject) => {
          attempts += 1;
          if (attempts > 1) {
            resolve('ok');
            return;
          }
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      { timeoutMs: 60_000 },
    );
    // Simuliramo osvježenje tokena dok prvi zahtjev visi.
    markTokenReady(Date.now() + 5);
    markTokenRefreshed();
    await expect(promise).resolves.toBe('ok');
    expect(attempts).toBe(2);
    expect(getWeakConnectionState().active).toBe(false);
  });
});
