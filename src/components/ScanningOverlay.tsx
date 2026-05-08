import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, FileText, Brain, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SCANNING_STEPS = [
  { icon: ScanLine, labelKey: 'scanning.step1', fallback: 'Čitam tekst sa slike...' },
  { icon: FileText, labelKey: 'scanning.step2', fallback: 'Prepoznajem stavke i iznose...' },
  { icon: Brain, labelKey: 'scanning.step3', fallback: 'Kategoriziram transakciju...' },
  { icon: CheckCircle2, labelKey: 'scanning.step4', fallback: 'Završavam analizu...' },
];

const TIP_KEYS = [
  'scanning.tip1',
  'scanning.tip2',
  'scanning.tip3',
  'scanning.tip4',
] as const;

interface ScanningOverlayProps {
  visible: boolean;
  imageCount?: number;
}

export const ScanningOverlay = ({ visible, imageCount = 1 }: ScanningOverlayProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIP_KEYS.length));

  useEffect(() => {
    if (!visible) {
      setCurrentStep(0);
      return;
    }

    const stepDurations = [2500, 4000, 3500, 3000];
    let timeout: NodeJS.Timeout;

    const advanceStep = (step: number) => {
      if (step < SCANNING_STEPS.length - 1) {
        timeout = setTimeout(() => {
          setCurrentStep(step + 1);
          advanceStep(step + 1);
        }, stepDurations[step]);
      }
    };

    advanceStep(0);
    return () => clearTimeout(timeout);
  }, [visible]);

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
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm rounded-xl p-6"
        >
          {/* Animated scanner icon */}
          <motion.div
            className="relative w-20 h-20 mb-6"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="absolute inset-0 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ScanLine className="w-10 h-10 text-primary" />
            </div>
            {/* Scanning line animation */}
            <motion.div
              className="absolute left-2 right-2 h-0.5 bg-primary/60 rounded-full"
              animate={{ top: ['20%', '80%', '20%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Title */}
          <p className="text-lg font-semibold text-foreground mb-1">
            {imageCount > 1
              ? `Analiziram ${imageCount} stranica...`
              : 'Analiziram račun...'}
          </p>
          <p className="text-xs text-muted-foreground mb-6">Ovo može potrajati do 30 sekundi</p>

          {/* Progress steps */}
          <div className="w-full max-w-xs space-y-3 mb-6">
            {SCANNING_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = idx === currentStep;
              const isDone = idx < currentStep;

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0.4 }}
                  animate={{
                    opacity: isDone || isActive ? 1 : 0.4,
                  }}
                  className="flex items-center gap-3"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
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

          {/* Rotating tips */}
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-xs text-muted-foreground/70 italic text-center"
            >
              💡 {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
