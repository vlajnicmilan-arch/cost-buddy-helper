import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, PencilLine, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Expense, ReceiptItem } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { GUIDED_EXPENSE_THRESHOLD } from '@/lib/guidedMode';
import { cn } from '@/lib/utils';
import { OnboardingManualSheet } from './OnboardingManualSheet';

interface GuidedEntryViewProps {
  displayName?: string | null;
  /** Sve transakcije korisnika (sve vrste). Hook garantira da je broj < THRESHOLD. */
  allExpenses: Expense[];
  /** Payment source-i korisnika; ako je prazno, sheet otvara inline add-source pod-ekran. */
  customPaymentSources: CustomPaymentSource[];
  onScan: () => void;
  /** Onboarding-only add — koristi se isključivo unutar guided faze. */
  onAddExpense: (
    expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    items?: ReceiptItem[],
    isPendingMemberTransaction?: boolean,
  ) => Promise<void>;
}

/**
 * Jedinstveni onboarding entrypoint kroz cijelu guided fazu (0..THRESHOLD-1
 * događaja). Uvijek nudi ista dva izbora: "Skeniraj" i "Unesi ručno". "Unesi
 * ručno" otvara onboarding-only minimalni sheet (nije standardni AddExpenseDialog).
 * Nakon THRESHOLD događaja `useGuidedMode` auto-exitea u standardni home.
 */
export const GuidedEntryView = ({
  displayName,
  allExpenses,
  customPaymentSources,
  onScan,
  onAddExpense,
}: GuidedEntryViewProps) => {
  const { t } = useTranslation();
  const [manualOpen, setManualOpen] = useState(false);

  const name = (displayName || '').trim();
  const count = allExpenses.length;
  const isZero = count === 0;
  const remaining = Math.max(0, GUIDED_EXPENSE_THRESHOLD - count);
  const last = allExpenses[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
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

      {/* D4: 3 progress kockice umjesto week-stripa. */}
      <div
        className="mb-6"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={GUIDED_EXPENSE_THRESHOLD}
        aria-valuenow={Math.min(count, GUIDED_EXPENSE_THRESHOLD)}
        aria-label={t('guidedHome.progress.aria', {
          count: Math.min(count, GUIDED_EXPENSE_THRESHOLD),
          total: GUIDED_EXPENSE_THRESHOLD,
          defaultValue: 'Napredak: {{count}} od {{total}}',
        })}
      >
        <div className="flex items-center justify-center gap-3">
          {Array.from({ length: GUIDED_EXPENSE_THRESHOLD }, (_, i) => {
            const filled = i < count;
            return (
              <div
                key={i}
                className={cn(
                  'w-14 h-14 rounded-lg border flex items-center justify-center transition-colors',
                  filled
                    ? 'bg-primary/10 border-primary'
                    : 'bg-muted/30 border-border/40',
                )}
                aria-label={t('guidedHome.progress.stepLabel', { n: i + 1, defaultValue: 'Događaj {{n}}' })}
              >
                <AnimatePresence>
                  {filled && (
                    <motion.span
                      key="check"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <Check className="w-7 h-7 text-primary" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Last entry kartica — zadržano po D4 mikro-odluci. */}
      <AnimatePresence mode="popLayout">
        {last && (
          <motion.div
            key={last.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mb-6 p-3 rounded-xl bg-muted/30 border border-border/40"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-3">
        <Button onClick={onScan} size="lg" className="gap-2 min-h-[44px] w-full">
          <Camera className="w-4 h-4" />
          {t('guidedHome.entry.scanCta', 'Skeniraj')}
        </Button>
        <Button
          onClick={() => setManualOpen(true)}
          size="lg"
          variant="outline"
          className="gap-2 min-h-[44px] w-full"
        >
          <PencilLine className="w-4 h-4" />
          {t('guidedHome.entry.manualCta', 'Unesi ručno')}
        </Button>
      </div>

      {remaining > 0 && !isZero && (
        <p className="text-xs text-muted-foreground mt-4 text-center">
          {t('guidedHome.entry.remaining', { defaultValue: 'Još {{n}} do potpunog prikaza.', n: remaining })}
        </p>
      )}

      <OnboardingManualSheet
        open={manualOpen}
        onOpenChange={setManualOpen}
        customPaymentSources={customPaymentSources}
        onAddExpense={onAddExpense}
      />
    </motion.div>
  );
};
