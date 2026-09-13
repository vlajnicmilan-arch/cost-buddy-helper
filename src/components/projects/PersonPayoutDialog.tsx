/**
 * "Isplati" from a person's card.
 *
 * First floor  — read-only earnings per engagement (hours, rate, earned, left).
 * Second floor — amount + wallet, with an editable FIFO proposal.
 * No advance: an engagement can never receive more than what remains on it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarIcon, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { usePersonPayout } from '@/hooks/usePersonPayout';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { getDateRange, makeCalendarDisabled } from '@/lib/dateValidation';
import {
  previewPersonPeriod,
  type EngagementPeriodPreview,
} from '@/lib/personPayoutPreview';
import {
  allocateFifo,
  payableObligations,
  round2,
  totalRemaining,
  validateAllocation,
  type Allocation,
  type EngagementObligation,
} from '@/lib/personPayout';
import type { PersonAggregate } from '@/lib/workerIdentity';

interface PersonPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string | null;
  name: string;
  aggregate: PersonAggregate | null;
  projectNames: Record<string, string>;
  onPaid?: () => void;
}

const parseAmount = (v: string): number => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const PersonPayoutDialog = ({
  open,
  onOpenChange,
  personId,
  name,
  aggregate,
  projectNames,
  onPaid,
}: PersonPayoutDialogProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();
  const { customPaymentSources } = useCustomPaymentSources();
  const { payPerson, submitting } = usePersonPayout();

  const [amount, setAmount] = useState('');
  const [paymentSource, setPaymentSource] = useState('');
  const [note, setNote] = useState('');
  const [allocation, setAllocation] = useState<Allocation>({});
  const [touched, setTouched] = useState(false);
  const [periodRange, setPeriodRange] = useState<DateRange | undefined>(undefined);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodPreview, setPeriodPreview] = useState<EngagementPeriodPreview[] | null>(null);

  const periodLimits = useMemo(() => getDateRange('report'), []);

  const obligations: EngagementObligation[] = useMemo(
    () =>
      (aggregate?.byProject ?? []).map((b) => ({
        engagementId: b.engagementId,
        projectId: b.projectId,
        hours: b.hours,
        hourlyRate: b.hourlyRate,
        remaining: b.remaining,
        shortfalls: b.shortfalls,
        unpaidFrom: b.unpaidFrom,
        unpaidTo: b.unpaidTo,
      })),
    [aggregate],
  );


  const payable = useMemo(() => payableObligations(obligations), [obligations]);
  const maxTotal = useMemo(() => totalRemaining(obligations), [obligations]);

  const sourceOptions = useMemo(
    () => customPaymentSources.map((s) => ({ value: `custom:${s.id}`, label: s.name })),
    [customPaymentSources],
  );

  useEffect(() => {
    if (!open) {
      setAmount('');
      setPaymentSource('');
      setNote('');
      setAllocation({});
      setTouched(false);
      setPeriodRange(undefined);
      setPeriodOpen(false);
      setPeriodLoading(false);
      setPeriodPreview(null);
    }
  }, [open]);

  // Fills the amount from hours worked in the selected period (all
  // engagements). Only a proposal — the user can still edit the amount and
  // the FIFO split stays untouched.
  const calcFromPeriod = async (range: DateRange | undefined) => {
    if (!range?.from || !range?.to) return;
    setPeriodLoading(true);
    try {
      const { total, items } = await previewPersonPeriod(
        obligations,
        format(range.from, 'yyyy-MM-dd'),
        format(range.to, 'yyyy-MM-dd'),
      );
      setPeriodPreview(items.filter((i) => i.hours > 0 || i.gross > 0));
      setAmount(String(total));
      setTouched(false);
    } finally {
      setPeriodLoading(false);
    }
  };

  // Silent FIFO proposal while the user has not edited the split by hand.
  useEffect(() => {
    if (touched) return;
    setAllocation(allocateFifo(obligations, parseAmount(amount)));
  }, [amount, obligations, touched]);

  const parsedAmount = parseAmount(amount);
  const validation = validateAllocation(obligations, allocation, parsedAmount);

  const submit = async () => {
    if (!validation.ok || !paymentSource) return;
    const res = await payPerson({
      obligations,
      allocation,
      paymentSource,
      paidAt: new Date().toISOString(),
      note: note.trim() || null,
      personId,
    });
    if (res.ok) {
      showSuccess(t('people.payout.done', 'Isplata zabilježena'));
      onPaid?.();
      onOpenChange(false);
    } else {
      const message = (res as { message?: string }).message ?? '';
      showError(
        message.includes('payout_exceeds_remaining')
          ? t('people.payout.exceeds', 'Iznos je veći od onoga što na angažmanu ostaje')
          : t('common.error'),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('people.payout.title', 'Isplata — {{name}}', { name })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* First floor: earnings per engagement (read-only) */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t('people.payout.earnings', 'Zarada po angažmanima')}
            </p>
            <div className="space-y-2">
              {payable.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('people.payout.nothingLeft', 'Nema nepodmirenih sati')}
                </p>
              )}
              {payable.map((o) => (
                <div key={o.engagementId} className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {(o.projectId && projectNames[o.projectId]) || t('people.unknownProject', 'Projekt')}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {formatAmount(o.hourlyRate)}/h
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{o.hours} h</span>
                    <span className="text-primary">
                      {t('people.remainingShort', 'ostaje')} {formatAmount(o.remaining)}
                    </span>
                  </div>
                  {(o.shortfalls ?? []).map((s, i) => (
                    <p key={s.payoutId ?? i} className="mt-1 text-[11px] text-muted-foreground">
                      {t('people.payout.shortfallFrom', 'Nedoplaćeno iz {{month}}: {{amount}}', {
                        month: s.periodEnd
                          ? new Date(s.periodEnd).toLocaleDateString(i18n.language, {
                              month: 'long',
                              year: 'numeric',
                            })
                          : t('people.payout.earlierPeriod', 'ranijeg razdoblja'),
                        amount: formatAmount(s.amount),
                      })}
                    </p>
                  ))}
                </div>

              ))}
            </div>
          </div>

          <Separator />

          {/* Second floor: amount, wallet, editable split */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('people.payout.period', 'Razdoblje')}</Label>
              <div className="mt-1 flex items-center gap-2">
                <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 min-w-0 flex-1 justify-start gap-1.5 text-xs font-normal"
                    >
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
                        setPeriodRange(range);
                        if (range?.from && range?.to) {
                          setPeriodOpen(false);
                          calcFromPeriod(range);
                        }
                      }}
                      numberOfMonths={1}
                      disabled={makeCalendarDisabled(periodLimits)}
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
                    disabled={periodLoading}
                    onClick={() => calcFromPeriod(periodRange)}
                  >
                    {periodLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      t('people.payout.calcFromHours', 'Izračunaj iz sati')
                    )}
                  </Button>
                )}
              </div>
              {periodPreview && periodPreview.length > 0 && (
                <div className="mt-2 space-y-1">
                  {periodPreview.map((p) => {
                    const o = payable.find((x) => x.engagementId === p.engagementId);
                    return (
                      <div
                        key={p.engagementId}
                        className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                      >
                        <span className="min-w-0 truncate">
                          {(p.projectId && projectNames[p.projectId]) ||
                            t('people.unknownProject', 'Projekt')}
                          {o ? ` · ${formatAmount(o.hourlyRate)}/h` : ''}
                        </span>
                        <span className="shrink-0">
                          {p.hours} h → {formatAmount(p.gross)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('people.payout.amount', 'Iznos isplate')}</Label>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setTouched(false);
                  }}
                  placeholder="0,00"
                />
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline min-h-[24px]"
                  onClick={() => {
                    setAmount(String(maxTotal));
                    setTouched(false);
                  }}
                >
                  <RefreshCw className="w-3 h-3" />
                  {t('people.payout.payAll', 'Isplati sve ({{amount}})', { amount: formatAmount(maxTotal) })}
                </button>
              </div>
              <div>
                <Label className="text-xs">{t('people.payout.source', 'Novčanik')}</Label>
                <Select value={paymentSource} onValueChange={setPaymentSource}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('people.payout.sourcePlaceholder', 'Odaberi novčanik')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {t('workers.payouts.noSources', 'Prvo dodaj izvor u Novčaniku')}
                      </div>
                    ) : (
                      sourceOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {payable.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t('people.payout.distribution', 'Raspodjela (najstarija obveza prva)')}
                </p>
                <div className="space-y-2">
                  {payable.map((o) => {
                    const over = validation.overAllocated.includes(o.engagementId);
                    return (
                      <div key={o.engagementId} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate text-xs">
                          {(o.projectId && projectNames[o.projectId]) || t('people.unknownProject', 'Projekt')}
                          <span className="text-muted-foreground"> · max {formatAmount(o.remaining)}</span>
                        </span>
                        <Input
                          inputMode="decimal"
                          className={`w-28 h-9 ${over ? 'border-destructive' : ''}`}
                          value={allocation[o.engagementId] ?? ''}
                          onChange={(e) => {
                            setTouched(true);
                            const v = parseAmount(e.target.value);
                            setAllocation((prev) => ({ ...prev, [o.engagementId]: round2(v) }));
                          }}
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
            )}

            <div>
              <Label className="text-xs">{t('people.payout.note', 'Bilješka')}</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('workers.payouts.notePlaceholder', 'Neobavezno...')}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={submit} disabled={submitting || !validation.ok || !paymentSource}>
            {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('people.payout.confirm', 'Isplati')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
