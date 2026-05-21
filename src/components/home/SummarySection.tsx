import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight, PiggyBank, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { hr as hrLocale, enUS, de as deLocale } from 'date-fns/locale';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Expense } from '@/types/expense';

interface SummarySectionProps {
  balance: number;
  netWorth: number;
  totalIncome: number;
  totalExpenses: number;
  totalTransfers: number;
  monthlyTransfers: number;
  monthlyTransferCount: number;
  allTransfers: Expense[];
  recurringCount: number;
  isLocalMode: boolean;
  simpleModeEnabled: boolean;
  prevMonthIncome: number;
  prevMonthExpenses: number;
  curMonthIncome: number;
  curMonthExpenses: number;
  onIncomeClick: () => void;
  onExpenseClick: () => void;
  onTransferClick: () => void;
  onRecurringClick: () => void;
  /** V2 dashboard: hide Available/NetWorth cards (hero shows balance/projects)
   *  and hide Transfers + Recurring rows (moved to Wallet tab). */
  compact?: boolean;
}

export const SummarySection = React.memo(({
  balance,
  netWorth,
  totalIncome,
  totalExpenses,
  totalTransfers,
  monthlyTransfers,
  monthlyTransferCount,
  allTransfers,
  recurringCount,
  isLocalMode,
  simpleModeEnabled,
  prevMonthIncome,
  prevMonthExpenses,
  curMonthIncome,
  curMonthExpenses,
  onIncomeClick,
  onExpenseClick,
  onTransferClick,
  onRecurringClick,
  compact = false,
}: SummarySectionProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();

  // Localized current month label (e.g. "travanj 2026")
  const dateLocale = i18n.language === 'en' ? enUS : i18n.language === 'de' ? deLocale : hrLocale;
  const currentMonthLabel = format(new Date(), 'LLLL yyyy', { locale: dateLocale });

  // Trend calculations
  const incomeTrendPercent = prevMonthIncome > 0
    ? Math.round(((curMonthIncome - prevMonthIncome) / prevMonthIncome) * 100)
    : null;
  const expenseTrendPercent = prevMonthExpenses > 0
    ? Math.round(((curMonthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100)
    : null;

  return (
    <>
      {/* Summary Cards */}
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'} gap-3 mb-4`} data-tutorial="summary-cards">
        {!compact && (
        <>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02, boxShadow: '0 4px 20px hsl(var(--primary) / 0.15)' }}
          className="p-3 sm:p-4 rounded-2xl border border-border/50 backdrop-blur-md text-center relative overflow-hidden transition-all duration-300"
          style={{ 
            borderLeftWidth: 3, 
            borderLeftColor: 'hsl(var(--primary))',
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.06) 0%, hsl(var(--primary) / 0.02) 50%, transparent 100%)',
          }}
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.available', 'Slobodno')}</span>
          </div>
          <p className={`relative text-base sm:text-xl font-bold ${balance >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {formatAmount(balance)}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{t('summary.availableHint', 'po svim računima')}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          whileHover={{ scale: 1.02, boxShadow: '0 4px 20px hsl(168 80% 50% / 0.15)' }}
          className="p-3 sm:p-4 rounded-2xl border border-border/50 backdrop-blur-md text-center relative overflow-hidden transition-all duration-300"
          style={{ 
            borderLeftWidth: 3, 
            borderLeftColor: 'hsl(168 80% 50%)',
            background: 'linear-gradient(135deg, hsl(168 80% 50% / 0.06) 0%, hsl(168 80% 50% / 0.02) 50%, transparent 100%)',
          }}
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(168 80% 50%) 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-center gap-2 mb-1">
            <PiggyBank className="w-4 h-4" style={{ color: 'hsl(168 80% 50%)' }} />
            <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.netWorth')}</span>
          </div>
          <p className="relative text-base sm:text-xl font-bold" style={{ color: netWorth >= 0 ? 'hsl(168 80% 50%)' : 'hsl(var(--destructive))' }}>
            {formatAmount(netWorth)}
          </p>
        </motion.div>
        </>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02, boxShadow: '0 4px 20px hsl(var(--income) / 0.15)' }}
          className="p-3 sm:p-4 rounded-2xl border border-border/50 backdrop-blur-md text-center cursor-pointer relative overflow-hidden transition-all duration-300"
          style={{ 
            borderLeftWidth: 3, 
            borderLeftColor: 'hsl(var(--income))',
            background: 'linear-gradient(135deg, hsl(var(--income) / 0.06) 0%, hsl(var(--income) / 0.02) 50%, transparent 100%)',
          }}
          onClick={onIncomeClick}
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--income)) 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-income" />
            <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.totalIncome')}</span>
          </div>
          <p className="relative text-base sm:text-xl font-bold text-income">{formatAmount(curMonthIncome)}</p>
          <p className="relative text-[9px] text-muted-foreground mt-0.5 capitalize">{currentMonthLabel}</p>
          {incomeTrendPercent !== null && Math.abs(incomeTrendPercent) < 1000 && (
            <div className="relative flex flex-col items-center mt-0.5">
              <span className={`text-[10px] sm:text-xs font-medium ${incomeTrendPercent >= 0 ? 'text-income' : 'text-destructive'}`}>
                {incomeTrendPercent >= 0 ? `+${incomeTrendPercent}%` : `${incomeTrendPercent}%`}
                {incomeTrendPercent >= 0 ? ' ↑' : ' ↓'}
              </span>
              <span className="text-[9px] text-muted-foreground">{t('summary.vsLastMonth')}</span>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.02, boxShadow: '0 4px 20px hsl(var(--destructive) / 0.15)' }}
          className="p-3 sm:p-4 rounded-2xl border border-border/50 backdrop-blur-md text-center cursor-pointer relative overflow-hidden transition-all duration-300"
          style={{ 
            borderLeftWidth: 3, 
            borderLeftColor: 'hsl(var(--destructive))',
            background: 'linear-gradient(135deg, hsl(var(--destructive) / 0.06) 0%, hsl(var(--destructive) / 0.02) 50%, transparent 100%)',
          }}
          onClick={onExpenseClick}
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(var(--destructive)) 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.totalExpenses')}</span>
          </div>
          <p className="relative text-base sm:text-xl font-bold text-destructive">{formatAmount(curMonthExpenses)}</p>
          <p className="relative text-[9px] text-muted-foreground mt-0.5 capitalize">{currentMonthLabel}</p>
          {expenseTrendPercent !== null && Math.abs(expenseTrendPercent) < 1000 && (
            <div className="relative flex flex-col items-center mt-0.5">
              <span className={`text-[10px] sm:text-xs font-medium ${expenseTrendPercent <= 0 ? 'text-income' : 'text-destructive'}`}>
                {expenseTrendPercent >= 0 ? `+${expenseTrendPercent}%` : `${expenseTrendPercent}%`}
                {expenseTrendPercent >= 0 ? ' ↑' : ' ↓'}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {expenseTrendPercent <= 0
                  ? t('summary.lessThanLastMonth', 'manje nego prošli mj. ✓')
                  : t('summary.moreThanLastMonth', 'više nego prošli mj.')}
              </span>
            </div>
          )}
        </motion.div>
      </div>

      {!compact && (
      <>
      {/* Transfers Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01, boxShadow: '0 4px 20px hsl(var(--muted-foreground) / 0.1)' }}
        className="mb-8 p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer relative overflow-hidden transition-all duration-300"
        style={{ 
          borderLeftWidth: 3, 
          borderLeftColor: 'hsl(var(--muted-foreground))',
          background: 'linear-gradient(135deg, hsl(var(--muted-foreground) / 0.04) 0%, transparent 100%)',
        }}
        onClick={onTransferClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('transactions.transfers')}</p>
              <p className="text-xs text-muted-foreground">
                {monthlyTransferCount === 0
                  ? t('transactions.noTransfers')
                  : `${monthlyTransferCount} ${monthlyTransferCount === 1 ? t('transactions.transfer').toLowerCase() : t('transactions.transfers').toLowerCase()}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono font-semibold text-lg text-muted-foreground">
              ↔ {formatAmount(monthlyTransfers)}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5 capitalize">{currentMonthLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('common.clickForDetails')} →</p>
          </div>
        </div>
      </motion.div>

      {/* Recurring Transactions Card */}
      {!isLocalMode && !simpleModeEnabled && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.01, boxShadow: '0 4px 20px hsl(var(--primary) / 0.1)' }}
          className="mb-8 p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer relative overflow-hidden transition-all duration-300"
          style={{ 
            borderLeftWidth: 3, 
            borderLeftColor: 'hsl(var(--accent))',
            background: 'linear-gradient(135deg, hsl(var(--accent) / 0.06) 0%, hsl(var(--accent) / 0.02) 50%, transparent 100%)',
          }}
          onClick={onRecurringClick}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Repeat className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium">{t('summary.recurring')}</p>
                <p className="text-xs text-muted-foreground">
                  {recurringCount === 0
                    ? t('summary.recurringNone')
                    : t('summary.recurringActive', { count: recurringCount })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('summary.recurringManage')}</p>
            </div>
          </div>
        </motion.div>
      )}
      </>
      )}
    </>
  );
});