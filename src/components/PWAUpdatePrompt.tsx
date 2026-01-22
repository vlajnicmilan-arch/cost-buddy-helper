import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Sparkles, Bug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// Set to true to show test button, false for production
const SHOW_TEST_BUTTON = true;

// Global reference for manual update check
let checkForUpdatesRef: (() => Promise<void>) | null = null;

export const checkForUpdates = async () => {
  if (checkForUpdatesRef) {
    await checkForUpdatesRef();
  }
};

export const PWAUpdatePrompt = () => {
  const { t } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log('SW Registered:', swUrl);
      // Store reference for manual check
      checkForUpdatesRef = async () => {
        setIsChecking(true);
        try {
          await r?.update();
          // Small delay to allow needRefresh to update
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!needRefresh) {
            toast.success(t('update.upToDate', 'Aplikacija je ažurna!'));
          }
        } catch (error) {
          console.error('Update check failed:', error);
          toast.error(t('update.checkFailed', 'Provjera nije uspjela'));
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

  useEffect(() => {
    if (needRefresh) {
      setShowPrompt(true);
      setIsTestMode(false);
    }
  }, [needRefresh]);

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
