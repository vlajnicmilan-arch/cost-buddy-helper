import { useEffect, useState, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RefreshCw, X, Sparkles, Bug, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// Set to false for production
const SHOW_TEST_BUTTON = false;

// LocalStorage key for auto-update preference
const AUTO_UPDATE_KEY = 'pwa-auto-update';

// Global reference for manual update check
let checkForUpdatesRef: (() => Promise<void>) | null = null;

export const checkForUpdates = async () => {
  if (checkForUpdatesRef) {
    await checkForUpdatesRef();
  }
};

// Helper to get auto-update preference
export const getAutoUpdatePreference = (): boolean => {
  try {
    return localStorage.getItem(AUTO_UPDATE_KEY) === 'true';
  } catch {
    return false;
  }
};

// Helper to set auto-update preference
export const setAutoUpdatePreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(AUTO_UPDATE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore localStorage errors
  }
};

export const PWAUpdatePrompt = () => {
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
    onRegisteredSW(swUrl, r) {
      // Store reference for manual check
      checkForUpdatesRef = async () => {
        setIsChecking(true);
        setPendingUpdateCheck(true);
        try {
          await r?.update();
          // Wait a bit for needRefresh to potentially update
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error('Update check failed:', error);
          toast.error(t('update.checkFailed', 'Provjera nije uspjela'));
          setPendingUpdateCheck(false);
        } finally {
          setIsChecking(false);
        }
      };
      
      // Check for updates every 60 minutes
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  // Expose checking state globally
  useEffect(() => {
    (window as any).__pwaIsChecking = isChecking;
  }, [isChecking]);

  // Handle auto-update when new version is detected
  const performAutoUpdate = useCallback(() => {
    toast.info('Ažuriranje aplikacije...', { duration: 2000 });
    setTimeout(() => {
      updateServiceWorker(true);
    }, 500);
  }, [updateServiceWorker]);

  // Handle the result of update check after needRefresh state is updated
  useEffect(() => {
    if (pendingUpdateCheck && !isChecking) {
      // Check finished, now we can reliably check needRefresh
      if (needRefresh) {
        // New version found
        if (autoUpdate) {
          // Auto-update enabled - update automatically
          performAutoUpdate();
        } else {
          // Show update prompt
          setShowPrompt(true);
          setIsTestMode(false);
        }
      } else {
        // No new version - safe to show "up to date" message
        toast.success(t('update.upToDate', 'Aplikacija je ažurna!'));
      }
      setPendingUpdateCheck(false);
    }
  }, [pendingUpdateCheck, isChecking, needRefresh, t, autoUpdate, performAutoUpdate]);

  useEffect(() => {
    if (needRefresh && !pendingUpdateCheck) {
      // Only auto-show if not from manual check (manual check handles it in the effect above)
      if (autoUpdate) {
        // Auto-update enabled - update automatically
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
    } else {
      updateServiceWorker(true);
      setShowPrompt(false);
    }
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
      toast.success('Automatsko ažuriranje uključeno');
      // If there's a pending update, apply it now
      if (needRefresh && !isTestMode) {
        performAutoUpdate();
      }
    } else {
      toast.info('Automatsko ažuriranje isključeno');
    }
  };

  const handleTestClick = () => {
    setIsTestMode(true);
    setShowPrompt(true);
  };

  return (
    <>
      {/* Test button - only visible when enabled */}
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
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t('update.description')}
                  </p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Auto-update toggle */}
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <Label htmlFor="auto-update" className="text-sm cursor-pointer">
                    Automatsko ažuriranje
                  </Label>
                </div>
                <Switch
                  id="auto-update"
                  checked={autoUpdate}
                  onCheckedChange={handleAutoUpdateToggle}
                />
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
                <Button
                  size="sm"
                  className="flex-1 rounded-xl gap-2"
                  onClick={handleUpdate}
                >
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
