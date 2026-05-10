/**
 * useAppUpdateChecker
 *
 * Polls the version manifest on app boot, when returning to the foreground,
 * and periodically. Surfaces an UpdateAvailableDialog state when a newer
 * version is available, or when the kill-switch (`minSupportedVersion`)
 * forces it.
 *
 * Faza 4 §2: minSupportedVersion default `0.0.0` → mechanism dormant.
 * Faza 4 §3: telemetry on every check + accepted/declined.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '@/lib/version';
import {
  fetchLatestVersion,
  getInstalledAppVersion,
  isRemoteVersionNewer,
  isUpdateForced,
  isNativeApp,
} from './updateUtils';
import { logUpdateEvent } from '@/lib/updateTelemetry';

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const STARTUP_DELAY_MS = 2500;
const DISMISSED_VERSION_KEY = 'vmb-update-dismissed-version';
const LAST_BOOT_VERSION_KEY = 'vmb-last-boot-version';

interface UpdateState {
  available: boolean;
  remoteVersion: string;
  currentVersion: string;
  apkUrl: string | null;
  sha256: string | null;
  forced: boolean;
}

const EMPTY_STATE: UpdateState = {
  available: false,
  remoteVersion: '',
  currentVersion: APP_VERSION,
  apkUrl: null,
  sha256: null,
  forced: false,
};

const getDismissedVersion = (): string | null => {
  try {
    return localStorage.getItem(DISMISSED_VERSION_KEY);
  } catch {
    return null;
  }
};

const setDismissedVersion = (v: string): void => {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, v);
  } catch {
    /* ignore */
  }
};

/**
 * Detects "install_completed" by comparing previous boot version to current
 * APP_VERSION. Runs once per boot.
 */
const detectInstallCompletion = (): void => {
  try {
    const previous = localStorage.getItem(LAST_BOOT_VERSION_KEY);
    if (previous && previous !== APP_VERSION && isRemoteVersionNewer(previous, APP_VERSION)) {
      logUpdateEvent('update_install_completed', {
        from: previous,
        to: APP_VERSION,
      });
    }
    localStorage.setItem(LAST_BOOT_VERSION_KEY, APP_VERSION);
  } catch {
    /* ignore */
  }
};

export const useAppUpdateChecker = () => {
  const [state, setState] = useState<UpdateState>(EMPTY_STATE);
  const inFlightRef = useRef(false);

  const performCheck = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const installedVersion = await getInstalledAppVersion();
      const result = await fetchLatestVersion();

      logUpdateEvent('update_check_performed', {
        remoteVersion: result.version,
        currentVersion: installedVersion,
        webVersion: APP_VERSION,
        origin: result.origin,
        error: result.error,
        sha256Present: !!result.sha256,
        minSupported: result.minSupportedVersion,
      });

      if (!result.version) {
        return;
      }

      const isNewer = isRemoteVersionNewer(installedVersion, result.version);
      const forced = isUpdateForced(installedVersion, result.minSupportedVersion);

      if (!isNewer && !forced) {
        // Up to date — clear any previously dismissed flag so future updates show again
        return;
      }

      // Respect "later" dismissal but not for forced updates
      if (!forced && getDismissedVersion() === result.version) {
        return;
      }

      setState({
        available: true,
        remoteVersion: result.version,
        currentVersion: installedVersion,
        apkUrl: result.apkUrl,
        sha256: result.sha256,
        forced,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    if (state.forced) return; // Cannot dismiss forced updates
    setDismissedVersion(state.remoteVersion);
    setState(EMPTY_STATE);
  }, [state.forced, state.remoteVersion]);

  useEffect(() => {
    detectInstallCompletion();

    const startupTimer = window.setTimeout(() => {
      performCheck().catch((err) => console.error('[UpdateChecker] startup check failed:', err));
    }, STARTUP_DELAY_MS);

    const pollTimer = window.setInterval(() => {
      performCheck().catch((err) => console.error('[UpdateChecker] poll failed:', err));
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        performCheck().catch((err) => console.error('[UpdateChecker] visibility check failed:', err));
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [performCheck]);

  return {
    ...state,
    isNative: isNativeApp,
    dismiss,
    triggerCheck: performCheck,
  };
};
