import { describe, it, expect } from 'vitest';
import {
  BOOT_STALL_DELAYS_MS,
  buildBootStallDetails,
  hasSupabaseSessionInStorage,
} from '@/lib/bootStallDiagnostics';

const storageFrom = (keys: string[]) => ({
  length: keys.length,
  key: (i: number) => keys[i] ?? null,
});

describe('boot watchdog dijagnostika', () => {
  it('javlja se na 8 s i 20 s', () => {
    expect([...BOOT_STALL_DELAYS_MS]).toEqual([8000, 20000]);
  });

  it('prepoznaje spremljenu sesiju po ključu sb-*-auth-token', () => {
    expect(hasSupabaseSessionInStorage(storageFrom(['sb-abc-auth-token']))).toBe(true);
    expect(hasSupabaseSessionInStorage(storageFrom(['theme', 'i18nextLng']))).toBe(false);
    expect(hasSupabaseSessionInStorage(storageFrom(['sb-abc-auth-token-code-verifier']))).toBe(false);
  });

  it('detalji sadrže sva tražena polja', () => {
    const details = buildBootStallDetails({
      isInitialized: true,
      authReady: false,
      appStateReady: false,
      storageMode: 'cloud',
      hostname: 'app.vmbalance.com',
      pathname: '/app',
      elapsedMs: 8000,
    });
    expect(Object.keys(details).sort()).toEqual(
      [
        'appStateReady',
        'authReady',
        'elapsedMs',
        'hasSessionInLocalStorage',
        'hostname',
        'isCapacitor',
        'isInitialized',
        'navigatorLocksSupported',
        'pathname',
        'storageMode',
      ].sort(),
    );
    expect(details.authReady).toBe(false);
    expect(details.storageMode).toBe('cloud');
  });
});
