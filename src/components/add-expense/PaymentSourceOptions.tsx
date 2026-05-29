import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { PAYMENT_SOURCE_GROUPS, PAYMENT_SOURCES } from '@/types/expense';
import { useAppState } from '@/contexts/AppStateContext';
import { useCurrency, CURRENCIES } from '@/contexts/CurrencyContext';

interface PaymentSourceOptionsProps {
  customPaymentSources: CustomPaymentSource[];
  /** Currently selected value (custom id or standard id). Used to auto-expand standard list when needed. */
  currentValue?: string | null;
  /** Source id to exclude (used in transfer destination select). */
  excludeId?: string | null;
  /** Show balance next to custom sources. */
  showBalance?: boolean;
  /** Show business vs personal-loan grouping. */
  showLoanGroup?: boolean;
  /** Hide the standard-sources section entirely (e.g. when calling code wants only custom). */
  hideStandard?: boolean;
  /** Prefix added to custom source ids when used as SelectItem values. Some callers use 'custom:' prefix. */
  customValuePrefix?: string;
}

/**
 * Shared body for a <Select> that lists payment sources.
 * Renders custom sources at the top and hides standard ones behind a toggle.
 * Must be placed inside <SelectContent>.
 */
export const PaymentSourceOptions = ({
  customPaymentSources,
  currentValue,
  excludeId,
  showBalance = false,
  showLoanGroup = false,
  hideStandard = false,
  customValuePrefix = '',
}: PaymentSourceOptionsProps) => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { currency: primaryCurrency } = useCurrency();

  const businessSources = (activeBusinessProfileId && showLoanGroup)
    ? customPaymentSources.filter((s) => s.business_profile_id === activeBusinessProfileId)
    : customPaymentSources;
  const personalLoanSources = (activeBusinessProfileId && showLoanGroup)
    ? customPaymentSources.filter((s) => !s.business_profile_id)
    : [];

  const filteredBusiness = businessSources.filter((s) => s.id !== excludeId);
  const filteredLoan = personalLoanSources.filter((s) => s.id !== excludeId);

  const hasCustom = filteredBusiness.length > 0 || filteredLoan.length > 0;

  // Standard expanded by default if user has no custom or current value is a standard id.
  const isStandardSelected = !!currentValue
    && !currentValue.startsWith('custom:')
    && PAYMENT_SOURCES.some((s) => s.id === currentValue);
  const [showStandard, setShowStandard] = useState(!hasCustom || isStandardSelected);

  const sourceLabel = (id: string, name: string) => {
    const key = `paymentSources.${id}`;
    const tr = t(key);
    return tr !== key ? tr : name;
  };

  const toggle = () => setShowStandard((v) => !v);

  return (
    <>
      {filteredBusiness.length > 0 && (
        <>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {activeBusinessProfileId && showLoanGroup
              ? t('business.payment.businessAccountsGroup', 'Poslovni računi')
              : t('transactions.myMethods', 'Moji izvori')}
          </div>
          {filteredBusiness.map((source) => {
            const isViewer = source.myRole === 'viewer';
            return (
            <SelectItem key={source.id} value={`${customValuePrefix}${source.id}`} disabled={isViewer}>
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: source.color + '20', color: source.color }}
                >
                  {source.icon}
                </span>
                <span>{source.name}</span>
                {isViewer && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 ml-1">
                    {t('paymentSources.viewerOnly', 'samo pregled')}
                  </Badge>
                )}
                {showBalance && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {(CURRENCIES.find((c) => c.code === source.currency)?.symbol || primaryCurrency.symbol)}
                    {source.balance.toFixed(2)}
                  </span>
                )}
              </div>
            </SelectItem>
            );
          })}

        </>
      )}

      {filteredLoan.length > 0 && (
        <>
          <div className="px-2 py-1.5 mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
            <span>🪙</span>
            <span>{t('business.payment.personalAccountsGroup', 'Osobni računi (pozajmica)')}</span>
          </div>
          {filteredLoan.map((source) => (
            <SelectItem key={source.id} value={`${customValuePrefix}${source.id}`}>
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: source.color + '20', color: source.color }}
                >
                  {source.icon}
                </span>
                <span>{source.name}</span>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400"
                >
                  {t('transactions.ownerLoanBadge', 'Pozajmica')}
                </Badge>
                {showBalance && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {(CURRENCIES.find((c) => c.code === source.currency)?.symbol || primaryCurrency.symbol)}
                    {source.balance.toFixed(2)}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </>
      )}

      {!hideStandard && hasCustom && (
        <div
          role="button"
          tabIndex={0}
          aria-expanded={showStandard}
          onPointerDown={(e) => {
            // Prevent Radix Select from treating this as an item selection / closing the menu.
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          }}
          className="mx-1 my-1 px-2 py-2 rounded-md text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 cursor-pointer flex items-center gap-1.5 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showStandard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>
            {showStandard
              ? t('paymentSources.hideStandard', 'Sakrij standardne izvore')
              : t('paymentSources.showStandard', 'Prikaži standardne izvore')}
          </span>
        </div>
      )}

      {!hideStandard && showStandard && PAYMENT_SOURCE_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {(() => {
              const k = `paymentSources.${group.label.toLowerCase().replace(/\s+/g, '')}`;
              const tr = t(k);
              return tr !== k ? tr : group.label;
            })()}
          </div>
          {group.sources
            .filter((s) => s.id !== excludeId)
            .map((source) => (
              <SelectItem key={source.id} value={source.id}>
                <span className="flex items-center gap-2">
                  <span>{source.icon}</span>
                  <span>{sourceLabel(source.id, source.name)}</span>
                </span>
              </SelectItem>
            ))}
        </div>
      ))}
    </>
  );
};
