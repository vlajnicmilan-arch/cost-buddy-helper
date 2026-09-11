/**
 * BOOT WATCHDOG — dijagnostika zaglavljenog pokretanja.
 *
 * Kad aplikacija ostane na kotačiću (npr. ruta /app u Android ljusci), ovdje
 * skupljamo činjenice o tome KOJI signal spremnosti nije stigao. Sve je
 * čisto promatračko: nikad ne mijenja ponašanje i nikad ne baca.
 */

/** Kada se javlja boot_stalled, mjereno od montiranja rutera. */
export const BOOT_STALL_DELAYS_MS = [8000, 20000] as const;

interface MinimalStorage {
  key(index: number): string | null;
  readonly length: number;
}

/** Postoji li spremljena Supabase sesija (ključ oblika `sb-*-auth-token`). */
export const hasSupabaseSessionInStorage = (storage?: MinimalStorage | null): boolean => {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch {
    /* noop */
  }
  return false;
};

/** Podržava li okruženje Web Locks API (supabase-js ga koristi za auth). */
export const navigatorLocksSupported = (): boolean => {
  try {
    return typeof navigator !== 'undefined' && !!(navigator as Navigator & { locks?: unknown }).locks;
  } catch {
    return false;
  }
};

/** Vrti li se kod unutar Capacitor ljuske. */
export const isCapacitorRuntime = (): boolean => {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
};

export interface BootStallInput {
  isInitialized: boolean;
  authReady: boolean;
  appStateReady: boolean;
  storageMode: string | null;
  hostname: string;
  pathname: string;
  elapsedMs: number;
}

export interface BootStallDetails extends BootStallInput {
  hasSessionInLocalStorage: boolean;
  isCapacitor: boolean;
  navigatorLocksSupported: boolean;
}

export const buildBootStallDetails = (input: BootStallInput): BootStallDetails => ({
  ...input,
  hasSessionInLocalStorage: hasSupabaseSessionInStorage(),
  isCapacitor: isCapacitorRuntime(),
  navigatorLocksSupported: navigatorLocksSupported(),
});
