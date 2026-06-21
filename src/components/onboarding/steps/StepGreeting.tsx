import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Sparkles } from 'lucide-react';

interface Props {
  displayName: string;
  onChange: (v: string) => void;
}

export const StepGreeting = ({ displayName, onChange }: Props) => {
  const { t } = useTranslation();
  const name = displayName.trim();

  return (
    <motion.div
      key="step-greeting"
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
          <Sparkles className="w-8 h-8 text-primary" />
        </motion.div>

        <h1 className="text-2xl font-bold">
          {name
            ? t('onboardingV3.greeting.titleNamed', { name, defaultValue: 'Drago mi je, {{name}}!' })
            : t('onboardingV3.greeting.title', 'Bok!')}
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          {t(
            'onboardingV3.greeting.intro',
            'Pomoći ću ti otkriti gdje ti odlazi novac i predlagati kako njime efikasnije upravljati.',
          )}
        </p>
        <p className="text-xs text-muted-foreground/80">
          {t('onboardingV3.greeting.brevityHint', 'Samo jedno pitanje i krećemo.')}
        </p>
        <p className="text-sm font-medium">
          {t('onboardingV3.greeting.askName', 'Kako da te zovem?')}
        </p>
      </div>

      <div className="space-y-2">
        <Input
          id="onb-name"
          value={displayName}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('onboardingV3.greeting.namePlaceholder', 'npr. Marko')}
          className="h-12 text-base text-center"
          autoFocus
          autoComplete="given-name"
        />
      </div>
    </motion.div>
  );
};
