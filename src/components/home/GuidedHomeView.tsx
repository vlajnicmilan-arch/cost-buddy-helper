import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Expense } from '@/types/expense';
import { GUIDED_EXPENSE_THRESHOLD } from '@/lib/guidedMode';
import { cn } from '@/lib/utils';

interface GuidedHomeViewProps {
  displayName?: string;
  /** Sve transakcije korisnika (sve vrste). Hook već garantira da je broj < THRESHOLD. */
  allExpenses: Expense[];
  onAddExpense: () => void;
}

/**
 * Guided home za 1..THRESHOLD-1 stvarnih unosa. Strukturalan payoff: prikazuje
 * tjednu mrežu od 7 mjesta gdje korisnik vidi *gdje je njegov unos sletio*.
 * Bez agregata, bez grafova, bez modula.
 */
export const GuidedHomeView = ({
  displayName,
  allExpenses,
  onAddExpense,
}: GuidedHomeViewProps) => {
  const { t } = useTranslation();
  const count = allExpenses.length;
  const name = (displayName || '').trim();

  // Posljednjih 7 dana — dan po dan, danas zadnji.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const days: { date: Date; hasEntry: boolean }[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() - (6 - i) * dayMs);
    const hasEntry = allExpenses.some((e) => {
      const ed = new Date(e.date);
      ed.setHours(0, 0, 0, 0);
      return ed.getTime() === d.getTime();
    });
    return { date: d, hasEntry };
  });

  const last = allExpenses[0];
  const remaining = Math.max(0, GUIDED_EXPENSE_THRESHOLD - count);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col py-8 sm:py-12 max-w-md"
    >
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
        {name
          ? t('guidedHome.guided.greetingNamed', 'Hvala, {{name}}.', { name })
          : t('guidedHome.guided.greeting', 'Hvala.')}
      </h2>
      <p className="text-base text-muted-foreground mb-8 leading-relaxed">
        {t(
          'guidedHome.guided.line',
          'Počinješ graditi pregled. Svaki sljedeći unos popunjava sliku.',
        )}
      </p>

      {/* Week strip — 7 mjesta, ispunjena = dani s barem jednim unosom. */}
      <div className="mb-8" aria-label={t('guidedHome.guided.weekAria', 'Zadnjih 7 dana')}>
        <div className="flex items-center justify-between gap-2">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className={cn(
                  'w-full aspect-square rounded-lg border transition-colors',
                  d.hasEntry
                    ? 'bg-primary border-primary'
                    : 'bg-muted/30 border-border/40',
                )}
              />
              <span className="text-[10px] text-muted-foreground">
                {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Zadnji unos — jedan red, bez padding kartice. */}
      {last && (
        <div className="mb-8 p-3 rounded-xl bg-muted/30 border border-border/40">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {last.description || t('common.noDescription', 'Bez opisa')}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(last.date).toLocaleDateString()}
              </p>
            </div>
            <p className="text-sm font-semibold shrink-0 tabular-nums">
              {last.amount.toFixed(2)} {last.currency || 'EUR'}
            </p>
          </div>
        </div>
      )}

      <Button onClick={onAddExpense} size="lg" className="gap-2 min-h-[44px] self-start">
        <Plus className="w-4 h-4" />
        {t('guidedHome.guided.primaryCta', 'Dodaj još jedan')}
      </Button>

      <p className="text-xs text-muted-foreground mt-4">
        {remaining > 0
          ? t('guidedHome.guided.remaining', { defaultValue: 'Još {{n}} do potpunog prikaza.', n: remaining })
          : ''}
      </p>
    </motion.div>
  );
};
