import { useEffect } from 'react';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '@/lib/version';
import {
  fetchLatestVersion,
  isRemoteVersionNewer,
  isNativeApp,
  getPlatformName,
} from './updateUtils';

let checkForUpdatesRef: (() => Promise<void>) | null = null;

const createNativeUpdateChecker = () => {
  return async () => {
    console.info('[NativeUpdate] Starting check...', {
      platform: getPlatformName(),
      isNative: isNativeApp,
      appVersion: APP_VERSION,
      href: window.location.href,
    });

    const result = await fetchLatestVersion();

    if (!result.version) {
      showError(`Provjera web verzije nije uspjela. Nijedan server nije odgovorio.`);
      console.error('[NativeUpdate] All origins failed');
      return;
    }

    console.info('[NativeUpdate] Remote version:', result.version, 'from', result.origin);
    console.info('[NativeUpdate] Local APP_VERSION:', APP_VERSION);

    if (isRemoteVersionNewer(APP_VERSION, result.version)) {
      toast.info(
        `Nova web verzija ${result.version} dostupna! (Trenutna: ${APP_VERSION})`,
        {
          action: { label: 'Osvježi', onClick: () => window.location.reload() },
          duration: 10000,
        }
      );
    } else {
      showSuccess(`Web verzija je ažurna (${APP_VERSION}).`);
    }
  };
};

export const initializeNativeUpdateChecker = () => {
  if (!isNativeApp) return null;
  const checker = createNativeUpdateChecker();
  checkForUpdatesRef = checker;
  return checker;
};

// Initialize immediately at module load
if (isNativeApp) {
  initializeNativeUpdateChecker();
}

export const checkForNativeUpdates = async () => {
  if (!checkForUpdatesRef && isNativeApp) {
    initializeNativeUpdateChecker();
  }
  if (checkForUpdatesRef) {
    await checkForUpdatesRef();
    return;
  }
  showError('Provjera ažuriranja nije dostupna na ovoj platformi.');
};

export const NativeUpdateInitializer = () => {
  const { t } = useTranslation();

  useEffect(() => {
    const checker = initializeNativeUpdateChecker();
    const silentCheck = async () => {
      const result = await fetchLatestVersion();
      if (result.version && isRemoteVersionNewer(APP_VERSION, result.version)) {
        toast.info(
          t('update.available'),
          {
            action: { label: t('update.updateNow'), onClick: () => window.location.reload() },
            duration: 10000,
          }
        );
      }
    };
    const timeoutId = window.setTimeout(() => {
      silentCheck().catch((error) => console.error('[NativeUpdate] Startup check failed:', error));
    }, 2500);

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        silentCheck().catch((error) => console.error('[NativeUpdate] Visibility check failed:', error));
      }
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisible);
      if (checkForUpdatesRef === checker) {
        checkForUpdatesRef = null;
      }
    };
  }, [t]);

  return null;
};
