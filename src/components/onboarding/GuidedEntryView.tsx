import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Camera, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Expense } from '@/types/expense';
import { GUIDED_EXPENSE_THRESHOLD } from '@/lib/guidedMode';
import { cn } from '@/lib/utils';

interface GuidedEntryViewProps {
  displayName?: string | null;
  /** Sve transakcije korisnika (sve vrste). Hook garantira da je broj < THRESHOLD. */
  allExpenses: Expense[];
  onScan: () => void;
  onManualAdd: () => void;
}

/**
 * Jedinstveni onboarding entrypoint kroz cijelu guided fazu (0..THRESHOLD-1
 * događaja). Uvijek nudi ista dva izbora: "Skeniraj" i "Unesi ručno". Kad
 * korisnik unese prvi događaj, ekran zadržava isti CTA par i dopuni se
 * week-stripom i prikazom zadnjeg unosa. Nakon THRESHOLD događaja
 * `useGuidedMode` auto-exitea u standardni home.
 */
export const GuidedEntryView = ({
  displayName,
  allExpenses,
  onScan,
  onManualAdd,
}: GuidedEntryViewProps) => {
  const { t } = useTranslation();
  const name = (displayName || '').trim();
  const count = allExpenses.length;
  const isZero = count === 0;
  const remaining = Math.max(0, GUIDED_EXPENSE_THRESHOLD - count);

  // Posljednjih 7 dana — danas zadnji.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() - (6 - i) * dayMs);
    const hasEntry = allExpenses.some((e) => {
      const ed = new Date(e.date);
      ed.setHours(0, 0, 0, 0);
      return ed.getTime() === d.getTime();
    });
    return { date: d, hasEntry };
  });

  const last = allExpenses[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col py-6 sm:py-10 max-w-md"
    >
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
        {isZero
          ? name
            ? t('guidedHome.entry.greetingZeroNamed', 'Bok, {{name}}.', { name })
            : t('guidedHome.entry.greetingZero', 'Bok.')
          : name
            ? t('guidedHome.entry.greetingGuidedNamed', 'Hvala, {{name}}.', { name })
            : t('guidedHome.entry.greetingGuided', 'Hvala.')}
      </h2>
      <p className="text-base text-muted-foreground mb-6 leading-relaxed">
        {isZero
          ? t('guidedHome.entry.lineZero', 'Zabilježi svoj prvi događaj. Sve ostalo dolazi iz toga.')
          : t('guidedHome.entry.lineGuided', 'Svaki sljedeći događaj popunjava sliku.')}
      </p>

      {/* Week strip i last entry pojavljuju se tek nakon prvog događaja. */}
      {!isZero && (
        <>
          <div className="mb-6" aria-label={t('guidedHome.entry.weekAria', 'Zadnjih 7 dana')}>
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

          {last && (
            <div className="mb-6 p-3 rounded-xl bg-muted/30 border border-border/40">
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
        </>
      )}

      <div className="flex flex-col gap-3">
        <Button onClick={onScan} size="lg" className="gap-2 min-h-[44px] w-full">
          <Camera className="w-4 h-4" />
          {t('guidedHome.entry.scanCta', 'Skeniraj')}
        </Button>
        <Button
          onClick={onManualAdd}
          size="lg"
          variant="outline"
          className="gap-2 min-h-[44px] w-full"
        >
          <PencilLine className="w-4 h-4" />
          {t('guidedHome.entry.manualCta', 'Unesi ručno')}
        </Button>
      </div>

      {remaining > 0 && !isZero && (
        <p className="text-xs text-muted-foreground mt-4">
          {t('guidedHome.entry.remaining', { defaultValue: 'Još {{n}} do potpunog prikaza.', n: remaining })}
        </p>
      )}
    </motion.div>
  );
};
