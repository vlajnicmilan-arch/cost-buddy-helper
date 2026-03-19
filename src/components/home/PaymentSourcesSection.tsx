import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Wallet, ChevronDown } from 'lucide-react';
import { useCurrency, CURRENCIES } from '@/contexts/CurrencyContext';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { CustomPaymentSource } from '@/types/customPaymentSource';

interface PaymentSourcesSectionProps {
  customPaymentSources: CustomPaymentSource[];
  onSourceClick: (source: CustomPaymentSource) => void;
}

export const PaymentSourcesSection = ({ customPaymentSources, onSourceClick }: PaymentSourcesSectionProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency, multiCurrencyEnabled } = useCurrency();
  const { convert } = useExchangeRates(multiCurrencyEnabled);

  if (customPaymentSources.length === 0) return null;

  const totalBalance = customPaymentSources.reduce((sum, s) => {
    const bal = s.balance || 0;
    if (multiCurrencyEnabled && s.currency && s.currency !== currency.code) {
      return sum + convert(bal, s.currency, currency.code);
    }
    return sum + bal;
  }, 0);

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
          {customPaymentSources.map((source) => {
            const sourceCurr = multiCurrencyEnabled && source.currency
              ? CURRENCIES.find(c => c.code === source.currency)
              : null;

            return (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSourceClick(source)}
                className="p-3 sm:p-4 rounded-2xl border border-border/50 backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02] group relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${source.color}0A 0%, ${source.color}04 50%, transparent 100%)`,
                  borderLeftWidth: 3,
                  borderLeftColor: source.color,
                  boxShadow: `0 2px 12px ${source.color}08`,
                }}
                whileHover={{
                  boxShadow: `0 4px 20px ${source.color}18`,
                }}
              >
                {/* Subtle radial glow in corner */}
                <div
                  className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-300"
                  style={{ background: `radial-gradient(circle, ${source.color} 0%, transparent 70%)` }}
                />
                <div className="relative flex items-center gap-2.5 mb-2.5">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-sm"
                    style={{
                      background: `linear-gradient(135deg, ${source.color}25, ${source.color}15)`,
                      color: source.color,
                    }}
                  >
                    {source.icon}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold truncate flex-1 text-foreground/90">{source.name}</span>
                </div>
                <p className="relative text-base sm:text-lg font-bold font-mono tracking-tight">
                  <span className={source.balance < 0 ? 'text-destructive' : ''} style={{ color: source.balance >= 0 ? source.color : undefined }}>
                    {sourceCurr
                      ? formatAmount(source.balance, source.currency as any)
                      : formatAmount(source.balance)
                    }
                  </span>
                </p>
                {sourceCurr && sourceCurr.code !== currency.code && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    ≈ {formatAmount(convert(source.balance, source.currency!, currency.code))}
                  </p>
                )}
                {source.cards && source.cards.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {source.cards.length} {source.cards.length === 1 ? t('common.card') : t('common.cards')}
                  </p>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </CollapsibleContent>
    </Collapsible>
  );
};
