import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PWAUpdatePrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log('SW Registered:', swUrl);
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

  useEffect(() => {
    if (needRefresh) {
      setShowPrompt(true);
    }
  }, [needRefresh]);

  const handleUpdate = () => {
    updateServiceWorker(true);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setNeedRefresh(false);
  };

  return (
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
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">Nova verzija dostupna!</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ažurirajte aplikaciju za najnovije značajke i popravke.
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                aria-label="Zatvori"
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
                Kasnije
              </Button>
              <Button
                size="sm"
                className="flex-1 rounded-xl gap-2"
                onClick={handleUpdate}
              >
                <RefreshCw className="w-4 h-4" />
                Ažuriraj
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};