import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCurrency } from '@/contexts/CurrencyContext';
import { makeCalendarDisabled, type DateRangeLimits } from '@/lib/dateValidation';
import type { EngagementPeriodPreview } from '@/lib/personPayoutPreview';
import type { EngagementObligation } from '@/lib/personPayout';

interface PayoutPeriodSectionProps {
  periodRange: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  onCalc: (range: DateRange) => void;
  loading: boolean;
  preview: EngagementPeriodPreview[] | null;
  obligations: readonly EngagementObligation[];
  projectNames: Record<string, string>;
  limits: DateRangeLimits;
  lockEntries: boolean;
  onLockEntriesChange: (v: boolean) => void;
}

export const PayoutPeriodSection = ({
  periodRange,
  onRangeChange,
  onCalc,
  loading,
  preview,
  obligations,
  projectNames,
  limits,
  lockEntries,
  onLockEntriesChange,
}: PayoutPeriodSectionProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Label className="text-xs">{t('people.payout.period', 'Razdoblje')}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 min-w-0 flex-1 justify-start gap-1.5 text-xs font-normal">
              <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {periodRange?.from
                  ? periodRange?.to
                    ? `${format(periodRange.from, 'yyyy-MM-dd')} → ${format(periodRange.to, 'yyyy-MM-dd')}`
                    : format(periodRange.from, 'yyyy-MM-dd')
                  : t('people.payout.pickPeriod', 'Odaberi razdoblje')}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={periodRange}
              onSelect={(range) => {
                onRangeChange(range);
                if (range?.from && range?.to) {
                  setOpen(false);
                  onCalc(range);
                }
              }}
              numberOfMonths={1}
              disabled={makeCalendarDisabled(limits)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        {periodRange?.from && periodRange?.to && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 text-xs"
            disabled={loading}
            onClick={() => onCalc(periodRange)}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('people.payout.calcFromHours', 'Izračunaj iz sati')}
          </Button>
        )}
      </div>

      <div className="mt-2 flex min-h-[44px] items-center justify-between gap-2">
        <Label htmlFor="payout-lock-entries" className="text-xs font-normal">
          {t('people.payout.lockEntries', 'Zaključaj radne unose u razdoblju')}
        </Label>
        <Switch id="payout-lock-entries" checked={lockEntries} onCheckedChange={onLockEntriesChange} />
      </div>

      {preview && preview.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex min-h-[44px] w-full items-center justify-between text-xs text-primary">
            {t('people.payout.rateBreakdown', 'Raščlamba po satnici')}
            <ChevronDown className="w-3.5 h-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1">
            {preview.map((p) => {
              const o = obligations.find((x) => x.engagementId === p.engagementId);
              return (
                <div
                  key={p.engagementId}
                  data-testid="rate-breakdown-row"
                  className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                >
                  <span className="min-w-0 truncate">
                    {(p.projectId && projectNames[p.projectId]) || t('people.unknownProject', 'Projekt')}
                  </span>
                  <span className="shrink-0">
                    {p.hours} h × {formatAmount(o?.hourlyRate ?? 0)}/h = {formatAmount(p.gross)}
                  </span>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
