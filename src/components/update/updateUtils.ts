import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '@/lib/version';

export const AUTO_UPDATE_KEY = 'pwa-auto-update';

export const FALLBACK_ORIGINS = [
  'https://vmbalance.com',
  'https://cost-buddy-helper.lovable.app',
] as const;

// Stabilan manifest u Storage-u — ažurira ga CI odmah nakon APK uploada,
// neovisno o tome je li frontend već published. Koristimo ga kao PRIMARNI
// izvor da update notifikacija ne ovisi o ručnom Publish kliku.
// URL se gradi iz VITE_SUPABASE_URL kako project ref ne bi bio hardkodiran.
const SUPABASE_URL_FALLBACK = 'https://fzalxjretvtvokiotvkf.supabase.co';
const SUPABASE_BASE = (
  import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL_FALLBACK
).replace(/\/$/, '');
const STORAGE_MANIFEST_URL = `${SUPABASE_BASE}/storage/v1/object/public/public-assets/releases/version.json`;

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

export const getInstalledAppVersion = async (): Promise<string> => {
  if (!getIsNativeApp()) return APP_VERSION;

  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info.version || APP_VERSION;
  } catch (error) {
    console.warn('[UpdateCheck] Native app version unavailable, falling back to APP_VERSION', error);
    return APP_VERSION;
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

export interface VersionManifest {
  version: string;
  minSupportedVersion?: string | null;
  sha256?: string | null;
  apkUrl?: string | null;
}

export interface VersionCheckResult {
  version: string | null;
  minSupportedVersion: string | null;
  sha256: string | null;
  apkUrl: string | null;
  origin: string | null;
  error: string | null;
}

const DEFAULT_APK_PATH = '/storage/v1/object/public/public-assets/vm-balance.apk';

export const buildDefaultApkUrl = (cacheBust: string): string | null => {
  const supabaseUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return `${supabaseUrl}${DEFAULT_APK_PATH}?download=centar.apk&v=${cacheBust}`;
};

export const fetchVersionManifestFromOrigin = async (
  origin: string
): Promise<VersionManifest | null> => {
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

    const data = (await response.json()) as Partial<VersionManifest>;
    const version = typeof data?.version === 'string' ? data.version : null;

    if (!version) {
      console.warn(`[UpdateCheck] ${requestUrl} -> invalid payload`, data);
      return null;
    }

    return {
      version,
      minSupportedVersion:
        typeof data.minSupportedVersion === 'string' ? data.minSupportedVersion : null,
      sha256: typeof data.sha256 === 'string' && data.sha256.length > 0 ? data.sha256 : null,
      apkUrl: typeof data.apkUrl === 'string' && data.apkUrl.length > 0 ? data.apkUrl : null,
    };
  } catch (error) {
    console.warn(`[UpdateCheck] ${requestUrl} -> network error`, error);
    return null;
  }
};

// Backward-compat shim used by older callers
export const fetchVersionFromOrigin = async (origin: string): Promise<string | null> => {
  const manifest = await fetchVersionManifestFromOrigin(origin);
  return manifest?.version ?? null;
};

export const fetchLatestVersion = async (): Promise<VersionCheckResult> => {
  const candidateOrigins = getCandidateOrigins();
  console.info('[UpdateCheck] Storage manifest:', STORAGE_MANIFEST_URL);
  console.info('[UpdateCheck] Candidate origins:', candidateOrigins);
  console.info('[UpdateCheck] Platform:', getPlatformName(), '| Native:', isNativeApp);
  console.info('[UpdateCheck] APP_VERSION:', APP_VERSION);

  // 1) Prvo probaj stabilni Storage manifest (ne ovisi o frontend deploy-u).
  try {
    const url = `${STORAGE_MANIFEST_URL}?t=${Date.now()}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache, no-store, must-revalidate', pragma: 'no-cache' },
    });
    if (res.ok) {
      const data = (await res.json()) as Partial<VersionManifest>;
      if (typeof data?.version === 'string' && data.version) {
        const apkUrl =
          (typeof data.apkUrl === 'string' && data.apkUrl) || buildDefaultApkUrl(data.version);
        console.info(
          `[UpdateCheck] Success from STORAGE -> ${data.version} (sha256=${data.sha256 ? 'set' : 'none'}, minSupported=${data.minSupportedVersion ?? 'n/a'})`
        );
        return {
          version: data.version,
          minSupportedVersion:
            typeof data.minSupportedVersion === 'string' ? data.minSupportedVersion : null,
          sha256:
            typeof data.sha256 === 'string' && data.sha256.length > 0 ? data.sha256 : null,
          apkUrl,
          origin: STORAGE_MANIFEST_URL,
          error: null,
        };
      }
    } else {
      console.warn(`[UpdateCheck] storage manifest -> HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[UpdateCheck] storage manifest fetch failed', err);
  }

  // 2) Fallback: web origin-i (ovise o tome je li frontend published).
  for (const origin of candidateOrigins) {
    const manifest = await fetchVersionManifestFromOrigin(origin);
    if (manifest) {
      const apkUrl = manifest.apkUrl ?? buildDefaultApkUrl(manifest.version);
      console.info(
        `[UpdateCheck] Success from ${origin} -> ${manifest.version} (sha256=${manifest.sha256 ? 'set' : 'none'}, minSupported=${manifest.minSupportedVersion ?? 'n/a'})`
      );
      return {
        version: manifest.version,
        minSupportedVersion: manifest.minSupportedVersion ?? null,
        sha256: manifest.sha256 ?? null,
        apkUrl,
        origin,
        error: null,
      };
    }
  }

  console.error('[UpdateCheck] All candidate origins failed');
  return {
    version: null,
    minSupportedVersion: null,
    sha256: null,
    apkUrl: null,
    origin: null,
    error: 'all_origins_failed',
  };
};

/**
 * Returns true when the installed version is older than the manifest's
 * `minSupportedVersion`. Empty/null/0.0.0 → never forced (kill-switch sleeping).
 */
export const isUpdateForced = (
  currentVersion: string,
  minSupportedVersion: string | null | undefined
): boolean => {
  if (!minSupportedVersion) return false;
  if (minSupportedVersion === '0.0.0') return false;
  return isRemoteVersionNewer(currentVersion, minSupportedVersion);
};

// Faza 3: auto-update uvijek ON, opt-out uklonjen. Funkcije zadržane radi
// kompatibilnosti — getter vraća true, setter je no-op.
export const getAutoUpdatePreference = (): boolean => true;

export const setAutoUpdatePreference = (_enabled: boolean): void => {
  // no-op — auto-update je uvijek uključen (Faza 3).
};

