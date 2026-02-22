import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Wallet, ChevronDown } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { CustomPaymentSource } from '@/types/customPaymentSource';

interface PaymentSourcesSectionProps {
  customPaymentSources: CustomPaymentSource[];
  onSourceClick: (source: CustomPaymentSource) => void;
}

export const PaymentSourcesSection = ({ customPaymentSources, onSourceClick }: PaymentSourcesSectionProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  if (customPaymentSources.length === 0) return null;

  const totalBalance = customPaymentSources.reduce((sum, s) => sum + s.balance, 0);

  return (
    <Collapsible className="mb-4" data-tutorial="payment-sources">
      <CollapsibleTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.98 }}
          className="p-3 sm:p-4 rounded-xl border bg-card cursor-pointer transition-colors w-full"
          style={{
            borderLeftWidth: 4,
            borderLeftColor: 'hsl(var(--primary))'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm sm:text-base font-semibold">{t('common.finances', 'Financije')}</p>
                <p className="text-xs text-muted-foreground">
                  {customPaymentSources.length} {customPaymentSources.length === 1 ? t('common.account', 'račun') : t('common.accounts', 'računa')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className={`text-base sm:text-xl font-bold ${totalBalance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {formatAmount(totalBalance)}
              </p>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
            </div>
          </div>
        </motion.div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3"
        >
          {customPaymentSources.map((source) => (
            <motion.div
              key={source.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSourceClick(source)}
              className="p-3 sm:p-4 rounded-xl border bg-card/50 backdrop-blur-sm cursor-pointer transition-colors"
              style={{
                borderColor: source.color + '40',
                borderLeftWidth: 4,
                borderLeftColor: source.color
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-base"
                  style={{ backgroundColor: source.color + '20', color: source.color }}
                >
                  {source.icon}
                </span>
                <span className="text-xs sm:text-sm font-medium truncate flex-1">{source.name}</span>
              </div>
              <p className="text-base sm:text-lg font-bold">
                <span className={source.balance < 0 ? 'text-destructive' : ''} style={{ color: source.balance >= 0 ? source.color : undefined }}>
                  {formatAmount(source.balance)}
                </span>
              </p>
              {source.cards && source.cards.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {source.cards.length} {source.cards.length === 1 ? t('common.card') : t('common.cards')}
                </p>
              )}
            </motion.div>
          ))}
        </motion.div>
      </CollapsibleContent>
    </Collapsible>
  );
};
