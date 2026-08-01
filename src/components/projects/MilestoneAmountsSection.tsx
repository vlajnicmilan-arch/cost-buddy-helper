import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { parseLocaleAmount } from '@/lib/money';
import { computeMilestoneMargin } from '@/lib/milestoneAmounts';
import { cn } from '@/lib/utils';

interface MilestoneAmountsSectionProps {
  /** Raw input value for planned cost (`budget`). Empty string = not entered. */
  cost: string;
  onCostChange: (value: string) => void;
  /** Raw input value for investor price. Ignored when `showPrice` is false. */
  price: string;
  onPriceChange: (value: string) => void;
  /**
   * Korak A — polje se NE renderira kad iznos nije namijenjen trenutnoj ulozi.
   * Skriveno polje ne smije ostaviti nikakav trag u sučelju.
   */
  showCost: boolean;
  showPrice: boolean;
  /** Faza nastala iz odluke — cijena je snimka odluke, samo za čitanje. */
  priceLocked?: boolean;
}

/**
 * Korak B — dva iznosa faze (planirani trošak + cijena prema investitoru)
 * i živi izračun marže. Marža se prikazuje SAMO kad su oba iznosa upisana
 * i cijena je veća od nule; nikad "0%", nikad crtica.
 */
export const MilestoneAmountsSection = ({
  cost,
  onCostChange,
  price,
  onPriceChange,
  showCost,
  showPrice,
  priceLocked = false,
}: MilestoneAmountsSectionProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();

  const costNum = cost.trim() === '' ? null : parseLocaleAmount(cost).value;
  const priceNum = price.trim() === '' ? null : parseLocaleAmount(price).value;
  const margin = showCost && showPrice ? computeMilestoneMargin(costNum, priceNum) : null;

  if (!showCost && !showPrice) return null;

  return (
    <div className="space-y-3">
      {showCost && (
        <div className="space-y-1.5">
          <Label htmlFor="milestone-cost">{t('projects.milestoneAmounts.costLabel')}</Label>
          <div className="relative">
            <MoneyInput
              id="milestone-cost"
              data-testid="milestone-cost"
              value={cost}
              onChange={(e) => onCostChange(e.target.value)}
              className="pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {currency.symbol}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t('projects.milestoneAmounts.costHelp')}</p>
        </div>
      )}

      {showPrice && (
        <div className="space-y-1.5">
          <Label htmlFor="milestone-price">{t('projects.milestoneAmounts.priceLabel')}</Label>
          <div className="relative">
            <MoneyInput
              id="milestone-price"
              data-testid="milestone-price"
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              disabled={priceLocked}
              className="pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {currency.symbol}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {priceLocked
              ? t('projects.milestoneAmounts.fromDecisionLocked')
              : t('projects.milestoneAmounts.priceHelp')}
          </p>
        </div>
      )}

      {margin && (
        <p
          data-testid="milestone-margin-line"
          className={cn('text-xs font-medium', margin.isNegative ? 'text-destructive' : 'text-muted-foreground')}
        >
          {t('projects.milestoneAmounts.marginLine', {
            cost: formatAmount(costNum as number),
            price: formatAmount(priceNum as number),
            margin: margin.pct,
          })}
          {margin.isNegative && (
            <span className="ml-1">{t('projects.milestoneAmounts.negativeHint')}</span>
          )}
        </p>
      )}
    </div>
  );
};
