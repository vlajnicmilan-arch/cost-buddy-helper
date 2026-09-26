import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  round2,
  type Allocation,
  type AllocationValidation,
  type EngagementObligation,
} from '@/lib/personPayout';

interface PayoutDistributionSectionProps {
  payable: readonly EngagementObligation[];
  projectNames: Record<string, string>;
  selected: ReadonlySet<string>;
  onToggle: (engagementId: string, checked: boolean) => void;
  allocation: Allocation;
  onAllocationChange: (engagementId: string, value: number) => void;
  onDistributeAll: () => void;
  validation: AllocationValidation;
  parsedAmount: number;
  maxTotal: number;
}

const parseAmount = (v: string): number => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const PayoutDistributionSection = ({
  payable,
  projectNames,
  selected,
  onToggle,
  allocation,
  onAllocationChange,
  onDistributeAll,
  validation,
  parsedAmount,
  maxTotal,
}: PayoutDistributionSectionProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const allSelected = payable.every((o) => selected.has(o.engagementId));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t('people.payout.distribution', 'Raspodjela (najstarija obveza prva)')}
        </p>
        {!allSelected && (
          <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={onDistributeAll}>
            {t('people.payout.distributeAll', 'Raspodijeli na sve')}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {payable.map((o) => {
          const isOn = selected.has(o.engagementId);
          const over = validation.overAllocated.includes(o.engagementId);
          const label = (o.projectId && projectNames[o.projectId]) || t('people.unknownProject', 'Projekt');
          return (
            <div key={o.engagementId} className="flex min-h-[44px] items-center gap-2">
              <Checkbox
                checked={isOn}
                aria-label={label}
                onCheckedChange={(v) => onToggle(o.engagementId, v === true)}
              />
              <span className="flex-1 min-w-0 truncate text-xs">
                {label}
                <span className="text-muted-foreground"> · max {formatAmount(o.remaining)}</span>
              </span>
              <Input
                inputMode="decimal"
                aria-label={t('people.payout.allocationFor', 'Iznos za {{project}}', { project: label })}
                className={`w-28 h-9 ${over ? 'border-destructive' : ''}`}
                disabled={!isOn}
                value={isOn ? (allocation[o.engagementId] ?? '') : '0'}
                onChange={(e) => onAllocationChange(o.engagementId, round2(parseAmount(e.target.value)))}
              />
            </div>
          );
        })}
      </div>
      {validation.exceedsTotal && (
        <p className="mt-2 text-xs text-destructive">
          {t('people.payout.exceedsTotal', 'Iznos je veći od ukupno nepodmirenog ({{amount}})', {
            amount: formatAmount(maxTotal),
          })}
        </p>
      )}
      {!validation.exceedsTotal && validation.overAllocated.length > 0 && (
        <p className="mt-2 text-xs text-destructive">
          {t('people.payout.exceeds', 'Iznos je veći od onoga što na angažmanu ostaje')}
        </p>
      )}
      {!validation.exceedsTotal &&
        validation.overAllocated.length === 0 &&
        parsedAmount > 0 &&
        Math.abs(validation.unallocated) >= 0.01 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('people.payout.unallocated', 'Neraspoređeno: {{amount}}', {
              amount: formatAmount(validation.unallocated),
            })}
          </p>
        )}
    </div>
  );
};
