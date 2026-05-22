import { useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, PartyPopper } from 'lucide-react';

const Confetti = lazy(() => import('react-confetti'));

interface Props {
  displayName: string;
  hasIncome: boolean;
  expenseCategoriesCount: number;
}

export const StepReady = ({ displayName, hasIncome, expenseCategoriesCount }: Props) => {
  const { t } = useTranslation();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    const stop = setTimeout(() => setShowConfetti(false), 3500);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(stop);
    };
  }, []);

  const items = [
    {
      key: 'budget',
      label: t('onboardingV3.ready.budget', 'Mjesečni budžet napravljen'),
      shown: expenseCategoriesCount > 0,
    },
    {
      key: 'cats',
      label: t('onboardingV3.ready.cats', '{{count}} kategorija troškova dodano', { count: expenseCategoriesCount }),
      shown: expenseCategoriesCount > 0,
    },
    {
      key: 'income',
      label: t('onboardingV3.ready.income', 'Prihod postavljen'),
      shown: hasIncome,
    },
  ].filter((i) => i.shown);

  const name = displayName.trim();

  return (
    <motion.div
      key="step-ready"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="w-full max-w-md mt-4 space-y-6 relative"
    >
      {showConfetti && (
        <Suspense fallback={null}>
          <div className="fixed inset-0 pointer-events-none z-10">
            <Confetti
              width={size.w}
              height={size.h}
              numberOfPieces={180}
              recycle={false}
              gravity={0.3}
              colors={['#21D4AE', '#f59e0b', '#3b82f6', '#22c55e', '#ec4899']}
            />
          </div>
        </Suspense>
      )}

      <div className="text-center space-y-3">
        <motion.div
          initial={{ scale: 0.4, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 10, stiffness: 110 }}
          className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
        >
          <PartyPopper className="w-10 h-10 text-primary" />
        </motion.div>

        <h2 className="text-2xl font-bold">
          {name
            ? t('onboardingV3.ready.titleNamed', { name, defaultValue: '{{name}}, tvoja aplikacija je spremna!' })
            : t('onboardingV3.ready.title', 'Tvoja aplikacija je spremna!')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('onboardingV3.ready.subtitle', 'Sve je postavljeno. Krenimo.')}
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <motion.div
              key={it.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.18 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20"
            >
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">{it.label}</span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
