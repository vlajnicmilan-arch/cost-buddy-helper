import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, FileText, Brain, CheckCircle2, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReceiptItem } from '@/types/expense';

const SCANNING_STEPS = [
  { icon: ScanLine, labelKey: 'scanning.step1', fallback: 'Čitam tekst sa slike...' },
  { icon: FileText, labelKey: 'scanning.step2', fallback: 'Prepoznajem stavke i iznose...' },
  { icon: Brain, labelKey: 'scanning.step3', fallback: 'Kategoriziram transakciju...' },
  { icon: CheckCircle2, labelKey: 'scanning.step4', fallback: 'Završavam analizu...' },
];

const TIPS = [
  'Savjet: Držite račun ravno za bolji rezultat',
  'Savjet: Dobro osvjetljenje poboljšava preciznost',
  'Savjet: Izbjegavajte sjene preko računa',
  'Savjet: Cijeli račun treba biti u kadru',
];

interface ScanningOverlayProps {
  visible: boolean;
  imageCount?: number;
  streamedItems?: ReceiptItem[];
  streamStatus?: string;
}

export const ScanningOverlay = ({ visible, imageCount = 1, streamedItems = [], streamStatus = '' }: ScanningOverlayProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  // Auto-advance steps based on stream status and items
  useEffect(() => {
    if (!visible) { setCurrentStep(0); return; }

    if (streamedItems.length > 0) {
      setCurrentStep(2); // Items found → categorizing step
    } else if (streamStatus.includes('analiz') || streamStatus.includes('Pronađ')) {
      setCurrentStep(1); // Analyzing
    } else if (streamStatus.includes('Komprim') || streamStatus.includes('Šaljem')) {
      setCurrentStep(0); // Sending
    }
  }, [visible, streamedItems.length, streamStatus]);

  useEffect(() => {
    if (!visible) return;
    // Fallback auto-advance if no stream events come
    const fallbackTimeout = setTimeout(() => {
      if (currentStep === 0) setCurrentStep(1);
    }, 4000);
    return () => clearTimeout(fallbackTimeout);
  }, [visible, currentStep]);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm rounded-xl p-6 overflow-y-auto"
        >
          {/* Animated scanner icon */}
          <motion.div
            className="relative w-20 h-20 mb-4 shrink-0"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="absolute inset-0 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ScanLine className="w-10 h-10 text-primary" />
            </div>
            <motion.div
              className="absolute left-2 right-2 h-0.5 bg-primary/60 rounded-full"
              animate={{ top: ['20%', '80%', '20%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Title */}
          <p className="text-lg font-semibold text-foreground mb-1">
            {streamStatus || (imageCount > 1
              ? `Analiziram ${imageCount} stranica...`
              : 'Analiziram račun...')}
          </p>
          <p className="text-xs text-muted-foreground mb-4">Ovo može potrajati do 30 sekundi</p>

          {/* Progress steps */}
          <div className="w-full max-w-xs space-y-2 mb-4 shrink-0">
            {SCANNING_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = idx === currentStep;
              const isDone = idx < currentStep;

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: isDone || isActive ? 1 : 0.4 }}
                  className="flex items-center gap-3"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isDone ? 'bg-income/15 text-income' :
                    isActive ? 'bg-primary/15 text-primary' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <StepIcon className={`w-4 h-4 ${isActive ? 'animate-pulse' : ''}`} />
                    )}
                  </div>
                  <span className={`text-sm ${
                    isDone ? 'text-income font-medium line-through' :
                    isActive ? 'text-foreground font-medium' :
                    'text-muted-foreground'
                  }`}>
                    {t(step.labelKey, step.fallback)}
                  </span>
                </motion.div>
              );
            })}
          </div>

          {/* Streamed items - live feed */}
          {streamedItems.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-xs mb-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  Pronađeni artikli ({streamedItems.length})
                </span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg bg-muted/30 p-2">
                <AnimatePresence>
                  {streamedItems.map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 }}
                      className="flex justify-between items-center text-xs gap-2"
                    >
                      <span className="text-foreground/80 truncate flex-1">
                        {item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}
                      </span>
                      <span className="text-foreground font-mono font-medium shrink-0">
                        {item.total_price.toFixed(2)}€
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Rotating tips */}
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-xs text-muted-foreground/70 italic text-center shrink-0"
            >
              💡 {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
