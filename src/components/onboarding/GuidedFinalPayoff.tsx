import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

/**
 * D5 — završni payoff ekran. Auto-dismiss (1.8s) okida se iz parenta;
 * komponenta je čisto presentacijska. UI-only gate, bez perzistencije.
 */
export const GuidedFinalPayoff = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 140 }}
        className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center mb-6"
      >
        <Check className="w-16 h-16 text-primary" strokeWidth={3} />
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="text-2xl sm:text-3xl font-semibold tracking-tight text-center"
      >
        {t('onboarding.payoff.title', 'Super.')}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="text-base text-muted-foreground mt-2 text-center max-w-sm"
      >
        {t('onboarding.payoff.subtitle', 'Imamo dovoljno za prvu sliku.')}
      </motion.p>
    </div>
  );
};
