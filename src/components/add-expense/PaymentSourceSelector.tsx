import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PaymentSource, PAYMENT_SOURCES, PAYMENT_SOURCE_GROUPS } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { CardLookup } from '@/components/CardLookup';
import { useTranslation } from 'react-i18next';
import { useCurrency, CURRENCIES } from '@/contexts/CurrencyContext';
import { useAppState } from '@/contexts/AppStateContext';

interface PaymentSourceSelectorProps {
  type: string;
  paymentSource: PaymentSource;
  onPaymentSourceChange: (source: PaymentSource) => void;
  selectedCardId: string | null;
  onSelectedCardIdChange: (id: string | null) => void;
  customPaymentSources: CustomPaymentSource[];
}

export const PaymentSourceSelector = ({
  type,
  paymentSource,
  onPaymentSourceChange,
  selectedCardId,
  onSelectedCardIdChange,
  customPaymentSources,
}: PaymentSourceSelectorProps) => {
  const { t } = useTranslation();
  const { currency: primaryCurrency } = useCurrency();
  const { activeBusinessProfileId } = useAppState();

  // In business mode, split custom sources into business-owned vs personal (cross-mode/loan)
  const businessSources = activeBusinessProfileId
    ? customPaymentSources.filter(s => s.business_profile_id === activeBusinessProfileId)
    : customPaymentSources;
  const personalLoanSources = activeBusinessProfileId
    ? customPaymentSources.filter(s => !s.business_profile_id)
    : [];

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">
        {type === 'transfer' ? '📤 Sa računa (odakle)' : type === 'income' ? t('transactions.incomeSourceLabel') : t('transactions.paymentMethod')}
      </Label>
      
      <Select
        value={paymentSource.startsWith('custom:') ? paymentSource : (customPaymentSources.find(s => s.id === paymentSource) ? paymentSource : paymentSource)}
        onValueChange={(value) => {
          onPaymentSourceChange(value as PaymentSource);
          onSelectedCardIdChange(null);
        }}
      >
        <SelectTrigger className="h-12 rounded-xl bg-background">
          <SelectValue placeholder={t('transactions.selectPaymentMethod')}>
            {(() => {
              const customSource = customPaymentSources.find(s => s.id === paymentSource);
              if (customSource) {
                return (
                  <span className="flex items-center gap-2">
                    <span 
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                      style={{ backgroundColor: customSource.color + '20', color: customSource.color }}
                    >
                      {customSource.icon}
                    </span>
                    <span>{customSource.name}</span>
                  </span>
                );
              }
              const standardSource = PAYMENT_SOURCES.find(s => s.id === paymentSource);
              if (standardSource) {
                return (
                  <span className="flex items-center gap-2">
                    <span>{standardSource.icon}</span>
                    <span>{t(`paymentSources.${standardSource.id}`) !== `paymentSources.${standardSource.id}` ? t(`paymentSources.${standardSource.id}`) : standardSource.name}</span>
                  </span>
                );
              }
              return t('transactions.selectPaymentMethod');
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-popover z-50 max-h-[300px]">
          {customPaymentSources.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('transactions.myMethods')}
              </div>
              {customPaymentSources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                      style={{ backgroundColor: source.color + '20', color: source.color }}
                    >
                      {source.icon}
                    </span>
                    <span>{source.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {(CURRENCIES.find(c => c.code === source.currency)?.symbol || primaryCurrency.symbol)}{source.balance.toFixed(2)}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}
          
          {PAYMENT_SOURCE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) !== `paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}` 
                  ? t(`paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`) 
                  : group.label}
              </div>
              {group.sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  <span className="flex items-center gap-2">
                    <span>{source.icon}</span>
                    <span>{t(`paymentSources.${source.id}`) !== `paymentSources.${source.id}` ? t(`paymentSources.${source.id}`) : source.name}</span>
                  </span>
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>

      {/* Card Selection */}
      {(() => {
        const selectedSource = customPaymentSources.find(s => s.id === paymentSource);
        if (!selectedSource?.cards?.length) return null;
        
        return (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              {t('transactions.selectCardLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectedCardIdChange(null)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                  !selectedCardId 
                    ? "border-primary bg-primary/10 text-primary" 
                    : "border-border bg-muted/50 hover:bg-muted"
                )}
              >
                {t('paymentSources.noCard')}
              </button>
              {selectedSource.cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelectedCardIdChange(card.id)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium transition-all border flex items-center gap-2",
                    selectedCardId === card.id 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border bg-muted/50 hover:bg-muted"
                  )}
                >
                  <span>💳</span>
                  <span>{card.card_name}</span>
                  <span className="text-muted-foreground">•••• {card.last_four_digits}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <CardLookup
        customPaymentSources={customPaymentSources}
        onSelect={(sourceId, cardId) => {
          onPaymentSourceChange(sourceId as PaymentSource);
          onSelectedCardIdChange(cardId);
        }}
      />
    </div>
  );
};
