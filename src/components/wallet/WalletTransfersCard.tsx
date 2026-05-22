import { motion } from 'framer-motion';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr as hrLocale, enUS, de as deLocale } from 'date-fns/locale';
import { useCurrency } from '@/contexts/CurrencyContext';
import { clickableProps } from '@/lib/a11y';

interface WalletTransfersCardProps {
  monthlyTransfers: number;
  monthlyTransferCount: number;
  onClick: () => void;
}

export const WalletTransfersCard = ({
  monthlyTransfers,
  monthlyTransferCount,
  onClick,
}: WalletTransfersCardProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();

  const dateLocale = i18n.language === 'en' ? enUS : i18n.language === 'de' ? deLocale : hrLocale;
  const currentMonthLabel = format(new Date(), 'LLLL yyyy', { locale: dateLocale });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01, boxShadow: '0 4px 20px hsl(var(--muted-foreground) / 0.1)' }}
      className="p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer relative overflow-hidden transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: 'hsl(var(--muted-foreground))',
        background: 'linear-gradient(135deg, hsl(var(--muted-foreground) / 0.04) 0%, transparent 100%)',
      }}
      {...clickableProps(onClick)}
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
  );
};
