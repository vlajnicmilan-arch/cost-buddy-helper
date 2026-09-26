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
import { Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { usePersonPayout } from '@/hooks/usePersonPayout';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { getDateRange } from '@/lib/dateValidation';
import {
  previewPersonPeriod,
  type EngagementPeriodPreview,
} from '@/lib/personPayoutPreview';
import {
  payableObligations,
  totalRemaining,
  validateAllocation,
  type Allocation,
  type EngagementObligation,
} from '@/lib/personPayout';
import {
  initialSelection,
  payoutSummary,
  proposeScopedAllocation,
  selectAll,
  selectedObligations,
} from '@/lib/personPayoutScope';
import type { PersonAggregate } from '@/lib/workerIdentity';
import { PayoutPeriodSection } from './personPayout/PayoutPeriodSection';
import { PayoutDistributionSection } from './personPayout/PayoutDistributionSection';
import { PayoutSummaryBar } from './personPayout/PayoutSummaryBar';

interface PersonPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string | null;
  name: string;
  aggregate: PersonAggregate | null;
  projectNames: Record<string, string>;
  /** Opened from a project: proposal and split stay on this project only. */
  projectId?: string | null;
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
  projectId = null,
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lockEntries, setLockEntries] = useState(true);
  const [periodRange, setPeriodRange] = useState<DateRange | undefined>(undefined);
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

  const earnedById = useMemo(
    () => Object.fromEntries((aggregate?.byProject ?? []).map((b) => [b.engagementId, b.earned])),
    [aggregate],
  );

  const payable = useMemo(() => payableObligations(obligations), [obligations]);
  const scoped = useMemo(() => selectedObligations(obligations, selected), [obligations, selected]);
  const maxTotal = useMemo(() => totalRemaining(obligations), [obligations]);
  const scopedMax = useMemo(() => totalRemaining(scoped), [scoped]);

  const sourceOptions = useMemo(
    () => customPaymentSources.map((s) => ({ value: `custom:${s.id}`, label: s.name })),
    [customPaymentSources],
  );

  // Opened from a project: only that project is selected (safety cut).
  // Opened from People without a project: every engagement is selected.
  useEffect(() => {
    if (open) setSelected(initialSelection(obligations, projectId));
  }, [open, projectId, obligations]);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setPaymentSource('');
      setNote('');
      setAllocation({});
      setTouched(false);
      setLockEntries(true);
      setPeriodRange(undefined);
      setPeriodLoading(false);
      setPeriodPreview(null);
    }
  }, [open]);

  // Fills the amount from hours worked in the selected period, for the
  // selected engagements only. Only a proposal — the amount stays editable.
  const calcFromPeriod = async (range: DateRange) => {
    if (!range.from || !range.to) return;
    setPeriodLoading(true);
    try {
      const { total, items } = await previewPersonPeriod(
        scoped,
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

  // Silent FIFO proposal over the selected engagements while the user has
  // not edited the split by hand.
  useEffect(() => {
    if (touched) return;
    setAllocation(proposeScopedAllocation(obligations, selected, parseAmount(amount)));
  }, [amount, obligations, selected, touched]);

  const parsedAmount = parseAmount(amount);
  const validation = validateAllocation(obligations, allocation, parsedAmount);
  const summary = payoutSummary(obligations, selected, earnedById, parsedAmount);

  const toggleEngagement = (engagementId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(engagementId);
      else next.delete(engagementId);
      return next;
    });
    if (!checked) {
      setAllocation((prev) => {
        const next = { ...prev };
        delete next[engagementId];
        return next;
      });
    }
  };

  const distributeAll = () => {
    setSelected(selectAll(obligations));
    setTouched(false);
  };

  const submit = async () => {
    if (!validation.ok || !paymentSource) return;
    const res = await payPerson({
      obligations,
      allocation,
      paymentSource,
      paidAt: new Date().toISOString(),
      note: note.trim() || null,
      lockEntries,
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
            <PayoutPeriodSection
              periodRange={periodRange}
              onRangeChange={setPeriodRange}
              onCalc={calcFromPeriod}
              loading={periodLoading}
              preview={periodPreview}
              obligations={obligations}
              projectNames={projectNames}
              limits={periodLimits}
              lockEntries={lockEntries}
              onLockEntriesChange={setLockEntries}
            />

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
                    setAmount(String(scopedMax));
                    setTouched(false);
                  }}
                >
                  <RefreshCw className="w-3 h-3" />
                  {t('people.payout.payAll', 'Isplati sve ({{amount}})', { amount: formatAmount(scopedMax) })}
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
              <PayoutDistributionSection
                payable={payable}
                projectNames={projectNames}
                selected={selected}
                onToggle={toggleEngagement}
                allocation={allocation}
                onAllocationChange={(id, v) => {
                  setTouched(true);
                  setAllocation((prev) => ({ ...prev, [id]: v }));
                }}
                onDistributeAll={distributeAll}
                validation={validation}
                parsedAmount={parsedAmount}
                maxTotal={maxTotal}
              />
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

        <PayoutSummaryBar summary={summary} />

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
