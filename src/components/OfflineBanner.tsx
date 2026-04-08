import { useState, useEffect } from 'react';
import { WifiOff, CloudOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { showSuccess } from '@/hooks/useStatusFeedback';

export const OfflineBanner = () => {
  const { t } = useTranslation();
  const { isOnline, queueSize, syncing } = useOfflineQueue();
  const [showSyncToast, setShowSyncToast] = useState(false);

  // Show toast when syncing completes
  useEffect(() => {
    if (isOnline && showSyncToast && !syncing && queueSize === 0) {
      showSuccess(t('offline.syncComplete', 'Offline transakcije su sinkronizirane!'));
      setShowSyncToast(false);
    }
  }, [isOnline, syncing, queueSize, showSyncToast, t]);

  useEffect(() => {
    if (!isOnline && queueSize > 0) {
      setShowSyncToast(true);
    }
  }, [isOnline, queueSize]);

  return (
    <AnimatePresence>
      {(!isOnline || (syncing && queueSize > 0)) && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-destructive text-destructive-foreground py-2 px-4 text-sm font-medium shadow-md safe-area-top"
        >
          {syncing ? (
            <>
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              <span>{t('offline.syncing', 'Sinkroniziram')} ({queueSize})...</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>
                {t('offline.noConnection')}
                {queueSize > 0 && ` • ${queueSize} ${t('offline.queued', 'na čekanju')}`}
              </span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
