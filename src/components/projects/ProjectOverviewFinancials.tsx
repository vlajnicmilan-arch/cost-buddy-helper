import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import type { ProjectFinancials } from '@/lib/projectFinancials';

interface Props {
  financials: ProjectFinancials;
  /** Rok projekta; red se prikazuje samo kad postoji. */
  endDate?: string | null;
  /** Marža se NIKAD ne prikazuje klijentu / investitoru. */
  showMargin: boolean;
}

/**
 * Red brojki na vrhu Pregleda — Ugovoreno, Primljeno, Potrošeno,
 * Preostalo budžeta (+ Marža za interni pogled). Sve dolazi iz istog
 * helpera kao popis projekata, početna, Budžet i Financiranje.
 */
export const ProjectOverviewFinancials = ({ financials, endDate, showMargin }: Props) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  const hasAnything =
    financials.contracted > 0 ||
    financials.received > 0 ||
    financials.spent > 0 ||
    financials.hasBudget;
  if (!hasAnything) return null;

  const margin = financials.margin;
  const remaining = financials.remainingBudget;

  return (
    <div className="p-4 rounded-lg border space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="p-2 sm:p-3 rounded-lg bg-muted text-center">
          <p className="text-base sm:text-xl font-bold tabular-nums truncate">
            {formatAmount(financials.contracted)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.contracted', 'Ugovoreno')}
          </p>
          {financials.contractedIsEstimate && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t('projects.contractedFromBudget', 'procjena iz budžeta')}
            </p>
          )}
        </div>

        <div className="p-2 sm:p-3 rounded-lg bg-income/10 text-center">
          <p className="text-base sm:text-xl font-bold text-income tabular-nums truncate">
            {formatAmount(financials.received)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.received', 'Primljeno')}
          </p>
        </div>

        <div className="p-2 sm:p-3 rounded-lg bg-expense/10 text-center">
          <p className="text-base sm:text-xl font-bold text-expense tabular-nums truncate">
            {formatAmount(financials.spent)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.spent', 'Potrošeno')}
          </p>
        </div>

        <div className="p-2 sm:p-3 rounded-lg bg-muted text-center">
          <p
            className={cn(
              'text-base sm:text-xl font-bold tabular-nums truncate',
              remaining !== null && remaining < 0 ? 'text-destructive' : undefined
            )}
          >
            {remaining === null ? '—' : formatAmount(remaining)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.remainingBudget', 'Preostalo budžeta')}
          </p>
          {financials.hasBudget && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {formatAmount(financials.spent)} / {formatAmount(financials.budget)}
            </p>
          )}
        </div>
      </div>

      {showMargin && margin !== null && (
        <div className="p-2 sm:p-3 rounded-lg bg-muted text-center">
          <p
            className={cn(
              'text-base sm:text-xl font-bold tabular-nums truncate',
              margin < 0 ? 'text-destructive' : 'text-income'
            )}
          >
            {margin >= 0 ? '+' : ''}
            {formatAmount(margin)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            {t('projects.realizedMargin', 'Marža')}
          </p>
        </div>
      )}

      {financials.phaseBudgetCoverage && (
        <p className="text-[11px] text-muted-foreground">
          {t('projects.phaseBudgetCoverage', 'Faze pokrivaju {{phases}} od {{budget}}', {
            phases: formatAmount(financials.phaseBudgetCoverage.phasesTotal),
            budget: formatAmount(financials.phaseBudgetCoverage.budget),
          })}
        </p>
      )}

      {endDate && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          {t('projects.projectDeadline', 'Rok projekta')}:{' '}
          {format(new Date(endDate), 'd. MMM yyyy', { locale: dateLocale })}
        </p>
      )}
    </div>
  );
};
