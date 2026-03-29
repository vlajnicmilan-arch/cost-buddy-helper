import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '@/lib/version';

export const AUTO_UPDATE_KEY = 'pwa-auto-update';

export const FALLBACK_ORIGINS = [
  'https://vmbalance.com',
  'https://cost-buddy-helper.lovable.app',
] as const;

export const getIsNativeApp = () => {
  if (typeof window === 'undefined') return false;

  const globalCapacitor = (window as Window & {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }).Capacitor;

  const platform = globalCapacitor?.getPlatform?.() ?? Capacitor.getPlatform();

  return Boolean(
    globalCapacitor?.isNativePlatform?.() ||
      Capacitor.isNativePlatform() ||
      platform === 'android' ||
      platform === 'ios'
  );
};

export const isNativeApp = getIsNativeApp();

export const getPlatformName = (): string => {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
};

export const parseVersion = (version: string) =>
  version
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isNaN(part) ? 0 : part));

export const isRemoteVersionNewer = (currentVersion: string, remoteVersion: string) => {
  const current = parseVersion(currentVersion);
  const remote = parseVersion(remoteVersion);
  const maxLength = Math.max(current.length, remote.length);

  for (let i = 0; i < maxLength; i += 1) {
    const currentPart = current[i] ?? 0;
    const remotePart = remote[i] ?? 0;

    if (remotePart > currentPart) return true;
    if (remotePart < currentPart) return false;
  }

  return false;
};

export const getCandidateOrigins = (): string[] => {
  const candidates: string[] = [];

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin && /^https?:\/\//.test(origin) && !candidates.includes(origin)) {
      candidates.push(origin);
    }
  }

  for (const fallbackOrigin of FALLBACK_ORIGINS) {
    if (!candidates.includes(fallbackOrigin)) {
      candidates.push(fallbackOrigin);
    }
  }

  return candidates;
};

export interface VersionCheckResult {
  version: string | null;
  origin: string | null;
  error: string | null;
}

export const fetchVersionFromOrigin = async (origin: string): Promise<string | null> => {
  const url = new URL('/version.json', origin);
  url.searchParams.set('t', Date.now().toString());
  const requestUrl = url.toString();

  try {
    const response = await fetch(requestUrl, {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache, no-store, must-revalidate',
        pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      console.warn(`[UpdateCheck] ${requestUrl} -> HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const version = typeof data?.version === 'string' ? data.version : null;

    if (!version) {
      console.warn(`[UpdateCheck] ${requestUrl} -> invalid payload`, data);
      return null;
    }

    console.info(`[UpdateCheck] Success from ${requestUrl} -> ${version}`);
    return version;
  } catch (error) {
    console.warn(`[UpdateCheck] ${requestUrl} -> network error`, error);
    return null;
  }
};

export const fetchLatestVersion = async (): Promise<VersionCheckResult> => {
  const candidateOrigins = getCandidateOrigins();
  console.info('[UpdateCheck] Candidate origins:', candidateOrigins);
  console.info('[UpdateCheck] Platform:', getPlatformName(), '| Native:', isNativeApp);
  console.info('[UpdateCheck] APP_VERSION:', APP_VERSION);
  console.info('[UpdateCheck] window.location.href:', window.location.href);

  for (const origin of candidateOrigins) {
    const version = await fetchVersionFromOrigin(origin);
    if (version) {
      return { version, origin, error: null };
    }
  }

  console.error('[UpdateCheck] All candidate origins failed');
  return { version: null, origin: null, error: 'all_origins_failed' };
};

export const getAutoUpdatePreference = (): boolean => {
  try {
    return localStorage.getItem(AUTO_UPDATE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setAutoUpdatePreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(AUTO_UPDATE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore localStorage errors
  }
};
