/**
 * NativeUpdateChecker
 *
 * Background app-update lifecycle. Replaces the old toast-only flow with a
 * proper UpdateAvailableDialog that:
 *  - Triggers an APK download + install on native (Android), or
 *  - Triggers `window.location.reload()` on web/PWA.
 *
 * Backward-compatible exports kept:
 *   - `NativeUpdateInitializer` (mounted in PWAUpdatePrompt)
 *   - `checkForNativeUpdates`  (manual trigger, e.g. settings → "Check now")
 */
import { useEffect } from 'react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { tr } from '@/lib/errorMessages';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '@/lib/version';
import {
  fetchLatestVersion,
  isRemoteVersionNewer,
  isUpdateForced,
  isNativeApp,
  getPlatformName,
} from './updateUtils';
import { useAppUpdateChecker } from './useAppUpdateChecker';
import { UpdateAvailableDialog } from './UpdateAvailableDialog';
import { logUpdateEvent } from '@/lib/updateTelemetry';

// ----- Manual trigger (Settings → "Check for updates") -----
export const checkForNativeUpdates = async (): Promise<void> => {
  console.info('[NativeUpdate] Manual check', {
    platform: getPlatformName(),
    isNative: isNativeApp,
    appVersion: APP_VERSION,
  });

  const result = await fetchLatestVersion();

  logUpdateEvent('update_check_performed', {
    remoteVersion: result.version,
    currentVersion: APP_VERSION,
    origin: result.origin,
    error: result.error,
    manual: true,
  });

  if (!result.version) {
    showError(tr('errors.appUpdate.webCheckFailed', 'Provjera ažuriranja nije uspjela.'));
    return;
  }

  const isNewer = isRemoteVersionNewer(APP_VERSION, result.version);
  const forced = isUpdateForced(APP_VERSION, result.minSupportedVersion);

  if (!isNewer && !forced) {
    showSuccess(tr('update.upToDate', 'Aplikacija je ažurna.'));
    return;
  }

  // Notify the in-app checker by dispatching a custom event the
  // initializer below picks up. Simpler than wiring a global store.
  window.dispatchEvent(new CustomEvent('vmb-force-update-check'));
};

// ----- Background initializer (mounted globally) -----
export const NativeUpdateInitializer = () => {
  useTranslation(); // ensure i18n is hydrated before dialog mounts
  const { available, remoteVersion, apkUrl, sha256, forced, isNative, currentVersion, dismiss, triggerCheck } =
    useAppUpdateChecker();

  useEffect(() => {
    const handler = () => {
      triggerCheck().catch((err) => console.error('[NativeUpdate] forced re-check failed:', err));
    };
    window.addEventListener('vmb-force-update-check', handler);
    return () => window.removeEventListener('vmb-force-update-check', handler);
  }, [triggerCheck]);

  if (!available) return null;

  return (
    <UpdateAvailableDialog
      open={available}
      remoteVersion={remoteVersion}
      currentVersion={currentVersion}
      apkUrl={apkUrl}
      sha256={sha256}
      forced={forced}
      isNative={isNative}
      onDismiss={dismiss}
    />
  );
};
