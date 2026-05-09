import { useEffect, useState, useCallback } from 'react';
// We no longer ship a Service Worker (the legacy PWA SW was caching a stale
// bundle and breaking the Capacitor APK on /setup). The local stub keeps the
// existing update UI happy without registering anything.
import { useRegisterSW } from '@/lib/pwa-register-stub';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RefreshCw, X, Sparkles, Bug, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { APP_VERSION } from '@/lib/version';
import {
  isNativeApp,
  fetchLatestVersion,
  isRemoteVersionNewer,
  getAutoUpdatePreference,
  setAutoUpdatePreference,
} from '@/components/update/updateUtils';
import { NativeUpdateInitializer } from '@/components/update/NativeUpdateChecker';

// Re-export for backward compatibility with SettingsDialog
export { getAutoUpdatePreference, setAutoUpdatePreference } from '@/components/update/updateUtils';
export { checkForNativeUpdates as checkForUpdates } from '@/components/update/NativeUpdateChecker';

const SHOW_TEST_BUTTON = false;

let webCheckForUpdatesRef: (() => Promise<void>) | null = null;

const PWAUpdatePromptInner = () => {
  const { t } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [pendingUpdateCheck, setPendingUpdateCheck] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(getAutoUpdatePreference);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      webCheckForUpdatesRef = async () => {
        setIsChecking(true);
        setPendingUpdateCheck(true);

        try {
          const result = await fetchLatestVersion();
          const hasVersionUpdate = result.version
            ? isRemoteVersionNewer(APP_VERSION, result.version)
            : false;

          await registration?.update();
          await new Promise((resolve) => setTimeout(resolve, 1500));

          if (hasVersionUpdate) {
            setNeedRefresh(true);
          }
        } catch (error) {
          console.error('[UpdateCheck] Web update check failed:', error);
          showError(t('update.checkFailed', 'Provjera nije uspjela'));
          setPendingUpdateCheck(false);
        } finally {
          setIsChecking(false);
        }
      };

      const triggerCheck = () => {
        webCheckForUpdatesRef?.();
      };

      setInterval(triggerCheck, 10 * 60 * 1000);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          triggerCheck();
        }
      });

      setTimeout(triggerCheck, 3000);
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  useEffect(() => {
    (window as Window & { __pwaIsChecking?: boolean }).__pwaIsChecking = isChecking;
  }, [isChecking]);

  const performAutoUpdate = useCallback(() => {
    toast.info(t('toasts.appUpdating'), { duration: 2000 });
    setTimeout(() => {
      updateServiceWorker(true);
    }, 500);
  }, [updateServiceWorker]);

  useEffect(() => {
    if (pendingUpdateCheck && !isChecking) {
      if (needRefresh) {
        if (autoUpdate) {
          performAutoUpdate();
        } else {
          setShowPrompt(true);
          setIsTestMode(false);
        }
      } else {
        showSuccess(t('update.upToDate', 'Aplikacija je ažurna!'));
      }
      setPendingUpdateCheck(false);
    }
  }, [pendingUpdateCheck, isChecking, needRefresh, t, autoUpdate, performAutoUpdate]);

  useEffect(() => {
    if (needRefresh && !pendingUpdateCheck) {
      if (autoUpdate) {
        performAutoUpdate();
      } else {
        setShowPrompt(true);
        setIsTestMode(false);
      }
    }
  }, [needRefresh, pendingUpdateCheck, autoUpdate, performAutoUpdate]);

  const handleUpdate = () => {
    if (isTestMode) {
      setShowPrompt(false);
      setIsTestMode(false);
      return;
    }
    updateServiceWorker(true);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setIsTestMode(false);
    if (!isTestMode) {
      setNeedRefresh(false);
    }
  };

  const handleAutoUpdateToggle = (enabled: boolean) => {
    setAutoUpdate(enabled);
    setAutoUpdatePreference(enabled);
    if (enabled) {
      showSuccess(t('toasts.autoUpdateOn'));
      if (needRefresh && !isTestMode) {
        performAutoUpdate();
      }
    } else {
      toast.info(t('toasts.autoUpdateOff'));
    }
  };

  const handleTestClick = () => {
    setIsTestMode(true);
    setShowPrompt(true);
  };

  return (
    <>
      {SHOW_TEST_BUTTON && (
        <button
          onClick={handleTestClick}
          className="fixed bottom-4 left-4 z-[99] p-2 bg-warning text-warning-foreground rounded-full shadow-lg hover:opacity-80 transition-opacity"
          title="Test update notification"
        >
          <Bug className="w-4 h-4" />
        </button>
      )}

      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-4 left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:max-w-sm"
          >
            <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 space-y-3">
              {isTestMode && (
                <div className="text-xs text-warning bg-warning/10 px-2 py-1 rounded-lg text-center mb-2">
                  🧪 Test prikaz - ovo je simulacija
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground">{t('update.available')}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{t('update.description')}</p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <Label htmlFor="auto-update" className="text-sm cursor-pointer">
                    Automatsko ažuriranje
                  </Label>
                </div>
                <Switch id="auto-update" checked={autoUpdate} onCheckedChange={handleAutoUpdateToggle} />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-xl"
                  onClick={handleDismiss}
                >
                  {t('update.later')}
                </Button>
                <Button size="sm" className="flex-1 rounded-xl gap-2" onClick={handleUpdate}>
                  <RefreshCw className="w-4 h-4" />
                  {t('update.updateNow')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export const PWAUpdatePrompt = () => {
  if (isNativeApp) {
    return <NativeUpdateInitializer />;
  }

  return <PWAUpdatePromptInner />;
};
