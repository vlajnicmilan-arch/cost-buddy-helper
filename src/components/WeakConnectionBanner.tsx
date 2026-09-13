/**
 * Tiha traka za slabu vezu.
 *
 * Prikazuje se dok dohvati Početne tiho ponavljaju pokušaj. Namjerno je
 * žuta (amber) i nenametljiva — crvena `OfflineBanner` ostaje rezervirana za
 * potpuni prekid mreže.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  getWeakConnectionState,
  subscribeWeakConnection,
  type WeakConnectionState,
} from '@/lib/weakConnection';

export const WeakConnectionBanner = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<WeakConnectionState>(getWeakConnectionState());
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );

  useEffect(() => subscribeWeakConnection(setState), []);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Potpuni offline već pokriva crvena traka — ne slažemo dvije.
  const visible = state.active && isOnline;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-amber-950 py-2 px-4 text-sm font-medium shadow-md safe-area-top"
          role="status"
        >
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          <span>{t('offline.weakConnection', 'Veza je slaba — osvježavam…')}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
