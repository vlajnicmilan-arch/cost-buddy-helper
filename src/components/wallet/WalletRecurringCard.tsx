import { motion } from 'framer-motion';
import { Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { clickableProps } from '@/lib/a11y';

interface WalletRecurringCardProps {
  onClick: () => void;
}

/**
 * Wallet entry point for recurring obligations. The card only summarises the
 * rules; all management happens in the existing `RecurringTransactionsPanel`.
 */
export const WalletRecurringCard = ({ onClick }: WalletRecurringCardProps) => {
  const { t } = useTranslation();
  const { recurringTransactions, loading } = useRecurringTransactions();

  const activeCount = recurringTransactions.filter(r => r.is_active).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01, boxShadow: '0 4px 20px hsl(var(--primary) / 0.1)' }}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: 'hsl(var(--primary))',
        background: 'linear-gradient(135deg, hsl(var(--primary) / 0.04) 0%, transparent 100%)',
      }}
      {...clickableProps(onClick, {
        label: t('recurring.title'),
        className: 'p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer relative overflow-hidden transition-all duration-300',
      })}
      data-testid="wallet-recurring-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Repeat className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{t('recurring.title')}</p>
            <p className="text-xs text-muted-foreground truncate">
              {loading
                ? t('recurring.loading')
                : activeCount === 0
                  ? t('recurring.noTransactions')
                  : `${activeCount} · ${t('recurring.active')}`}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">{t('common.clickForDetails')} →</p>
      </div>
    </motion.div>
  );
};
