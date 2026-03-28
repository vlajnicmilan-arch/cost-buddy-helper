import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight, PiggyBank, Repeat } from 'lucide-react';
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
  onIncomeClick: () => void;
  onExpenseClick: () => void;
  onTransferClick: () => void;
  onRecurringClick: () => void;
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
  onIncomeClick,
  onExpenseClick,
  onTransferClick,
  onRecurringClick,
}: SummarySectionProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" data-tutorial="summary-cards">
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
            <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.balance')}</span>
          </div>
          <p className={`relative text-base sm:text-xl font-bold ${balance >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {formatAmount(balance)}
          </p>
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
          <p className="relative text-base sm:text-xl font-bold text-income">{formatAmount(totalIncome)}</p>
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
          <p className="relative text-base sm:text-xl font-bold text-destructive">{formatAmount(totalExpenses)}</p>
        </motion.div>
      </div>

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
                {allTransfers.length === 0
                  ? t('transactions.noTransfers')
                  : `${allTransfers.length} ${allTransfers.length === 1 ? t('transactions.transfer').toLowerCase() : t('transactions.transfers').toLowerCase()}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono font-semibold text-lg text-muted-foreground">
              ↔ {formatAmount(totalTransfers)}
            </p>
            <p className="text-xs text-muted-foreground">{t('common.clickForDetails')} →</p>
          </div>
        </div>
        {allTransfers.length > 0 && monthlyTransferCount > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('transactions.thisMonth')}: {monthlyTransferCount} {monthlyTransferCount === 1 ? t('transactions.transfer').toLowerCase() : t('transactions.transfers').toLowerCase()}</span>
            <span className="font-mono">{formatAmount(monthlyTransfers)}</span>
          </div>
        )}
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
  );
};