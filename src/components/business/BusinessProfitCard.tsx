import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';
import { hr as hrLocale, enUS, de as deLocale } from 'date-fns/locale';
import { useCurrency } from '@/contexts/CurrencyContext';
import { computeProfitTrend } from '@/lib/profitTrend';

interface BusinessProfitCardProps {
  curMonthIncome: number;
  curMonthExpenses: number;
  prevMonthIncome: number;
  prevMonthExpenses: number;
  onIncomeClick?: () => void;
  onExpenseClick?: () => void;
  /** Visual variant. `default` = pre-Phase-4 look, `monarch` = Phase 4 restyle. */
  variant?: 'default' | 'monarch';
}

export const BusinessProfitCard = React.memo(({
  curMonthIncome,
  curMonthExpenses,
  prevMonthIncome,
  prevMonthExpenses,
  onIncomeClick,
  onExpenseClick,
  variant = 'default',
}: BusinessProfitCardProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();
  const monarch = variant === 'monarch';

  const dateLocale = i18n.language === 'en' ? enUS : i18n.language === 'de' ? deLocale : hrLocale;
  const currentMonthLabel = format(new Date(), 'LLLL yyyy', { locale: dateLocale });

  const profit = curMonthIncome - curMonthExpenses;
  const prevProfit = prevMonthIncome - prevMonthExpenses;
  const trend = computeProfitTrend(profit, prevProfit);

  const isEmpty = curMonthIncome === 0 && curMonthExpenses === 0;
  const positive = profit >= 0;
  const accent = positive ? 'var(--primary)' : 'var(--destructive)';

  const max = Math.max(curMonthIncome, curMonthExpenses, 1);
  const incomeWidth = Math.min((curMonthIncome / max) * 100, 100);
  const expenseWidth = Math.min((curMonthExpenses / max) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        monarch
          ? 'mb-6 sm:mb-8 pb-5 border-b border-border/40 pl-3 relative'
          : 'mb-4 p-4 sm:p-5 rounded-2xl border border-border/50 backdrop-blur-md relative overflow-hidden transition-all duration-300'
      }
      style={
        monarch
          ? {
              borderLeft: `3px solid hsl(${accent})`,
              ['--card-accent' as string]: accent,
            }
          : {
              borderLeftWidth: 3,
              borderLeftColor: `hsl(${accent})`,
              ['--card-accent' as string]: accent,
              background: `linear-gradient(135deg, hsl(${accent} / 0.05) 0%, transparent 60%)`,
            }
      }
    >

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={monarch
            ? 'text-[10px] font-medium uppercase tracking-widest text-muted-foreground'
            : 'text-xs text-muted-foreground'}>
            {monarch
              ? t('business.dashboard.profitLabel', 'Dobit')
              : t('business.dashboard.profitLoss', 'Dobit / Gubitak (ovaj mjesec)')}
          </p>


          <p className="text-[10px] text-muted-foreground/70 capitalize">{currentMonthLabel}</p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {trend.direction === 'up' && <TrendingUp className="w-3.5 h-3.5 text-income" />}
            {trend.direction === 'down' && <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
            {trend.direction === 'flat' && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
            <span
              className={`text-xs font-medium tabular-nums ${
                trend.direction === 'up'
                  ? 'text-income'
                  : trend.direction === 'down'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }`}
            >
              {trend.percent === null
                ? '—'
                : `${trend.percent > 0 ? '+' : ''}${trend.percent}%`}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t('business.dashboard.vsLastMonth', 'vs prošli mj.')}
            </span>
          </div>
        )}
      </div>

      {isEmpty ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('business.dashboard.noActivity', 'Još nema prometa ovog mjeseca')}
        </p>
      ) : (
        <>
          <p
            className={monarch
              ? 'mt-0.5 text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight'
              : 'mt-1 text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight'}
            style={{ color: `hsl(${accent})` }}
          >

            {profit > 0 ? '+' : ''}{formatAmount(profit)}
          </p>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={onIncomeClick}
              className="w-full text-left group"
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {t('business.dashboard.income', 'Prihodi')}
                </span>
                <span className={`text-sm font-medium tabular-nums ${monarch ? 'text-foreground/80' : 'text-income'}`}>
                  {formatAmount(curMonthIncome)}
                </span>
              </div>
              <div className={`h-[3px] rounded-full overflow-hidden ${monarch ? 'bg-muted/25' : 'bg-muted/40'}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${monarch ? 'bg-income/40' : 'bg-income'}`}
                  style={{ width: `${incomeWidth}%` }}
                />
              </div>
            </button>

            <button
              type="button"
              onClick={onExpenseClick}
              className="w-full text-left group"
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {t('business.dashboard.expenses', 'Rashodi')}
                </span>
                <span className={`text-sm font-medium tabular-nums ${monarch ? 'text-foreground/80' : 'text-destructive'}`}>
                  {formatAmount(curMonthExpenses)}
                </span>
              </div>
              <div className={`h-[3px] rounded-full overflow-hidden ${monarch ? 'bg-muted/25' : 'bg-muted/40'}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${monarch ? 'bg-destructive/40' : 'bg-destructive'}`}
                  style={{ width: `${expenseWidth}%` }}
                />
              </div>
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
});

BusinessProfitCard.displayName = 'BusinessProfitCard';
