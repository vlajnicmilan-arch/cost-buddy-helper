import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Rocket } from 'lucide-react';

interface Props {
  displayName: string;
}

/**
 * Step 2 (Ready) — most prema guided home.
 *
 * Po `mem://features/onboarding-strategy`: onboarding ne setupa ništa osim imena,
 * pa ovaj korak NE smije slaviti setup koji se nije dogodio (bez "sve je postavljeno",
 * bez checklist itema, bez confettija). Confetti je rezerviran za `WelcomeConfetti`
 * (post-onboarding) i guided home payoff (post-first-expense).
 */
export const StepReady = ({ displayName }: Props) => {
  const { t } = useTranslation();
  const name = displayName.trim();

  return (
    <motion.div
      key="step-ready"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="w-full max-w-md mt-4 space-y-6"
    >
      <div className="text-center space-y-3">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 120, delay: 0.1 }}
          className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
        >
          <Rocket className="w-8 h-8 text-primary" />
        </motion.div>

        <h2 className="text-2xl font-bold">
          {name
            ? t('onboardingV3.ready.titleNamed', { name, defaultValue: 'Spremni smo, {{name}}.' })
            : t('onboardingV3.ready.title', 'Spremni smo.')}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t(
            'onboardingV3.ready.subtitle',
            'Ostalo namještamo zajedno dok koristiš aplikaciju. Krenimo s prvim troškom.',
          )}
        </p>
      </div>
    </motion.div>
  );
};
