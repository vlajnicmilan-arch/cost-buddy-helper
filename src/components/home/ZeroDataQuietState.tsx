import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ZeroDataQuietStateProps {
  displayName?: string | null;
  onAddExpense: () => void;
}

/**
 * Tihi 0-data home. Korisnik ostaje ovdje dok ne unese prvi trošak (prijelaz u
 * guided), dosegne threshold (auto-exit) ili eksplicitno ne izađe iz guided
 * faze. Nema "skip" linka — skip path iz onboardinga već vodi ovamo i quiet
 * state mora ostati quiet (nema exita iz 0-data UI-jem).
 */
export const ZeroDataQuietState = ({
  displayName,
  onAddExpense,
}: ZeroDataQuietStateProps) => {
  const { t } = useTranslation();
  const name = (displayName || '').trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-start justify-start py-10 sm:py-16 max-w-md"
    >
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
        {name
          ? t('guidedHome.zero.greetingNamed', 'Bok, {{name}}.', { name })
          : t('guidedHome.zero.greeting', 'Bok.')}
      </h2>
      <p className="text-base text-muted-foreground mb-8 leading-relaxed">
        {t(
          'guidedHome.zero.line',
          'Kada budeš spreman, zabilježi prvi trošak. Sve ostalo dolazi iz toga.',
        )}
      </p>
      <Button
        onClick={onAddExpense}
        size="lg"
        className="gap-2 min-h-[44px]"
      >
        <Plus className="w-4 h-4" />
        {t('guidedHome.zero.primaryCta', 'Zabilježi prvi trošak')}
      </Button>
    </motion.div>
  );
};
