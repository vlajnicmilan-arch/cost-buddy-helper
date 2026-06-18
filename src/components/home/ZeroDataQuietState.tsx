import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ZeroDataQuietStateProps {
  displayName?: string;
  onAddExpense: () => void;
  onDismiss: () => void;
}

/**
 * Tihi 0-data home za skip / complete put bez prvog unosa.
 * Namjerno minimalan: pozdrav + jedna rečenica + jedan primarni CTA + jedan
 * tekstualni link. Ničega drugoga.
 */
export const ZeroDataQuietState = ({
  displayName,
  onAddExpense,
  onDismiss,
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
      <button
        type="button"
        onClick={onDismiss}
        className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline min-h-[44px]"
      >
        {t('guidedHome.zero.secondary', 'Preskoči za sada')}
      </button>
    </motion.div>
  );
};
