/**
 * "Plati" from a collaborator's card.
 *
 * One amount, one date, one wallet — one expense in the books plus one row in
 * the collaborator payment ledger. No hourly work, no allocation: a
 * collaborator has an agreed price, not hours.
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { canPay, round2 } from '@/lib/collaboratorPayment';

export interface CollaboratorPaymentTarget {
  collaboratorId: string;
  projectId: string;
  projectName: string;
  serviceDescription: string;
  /** null = agreed amount was never entered, so there is no ceiling. */
  remaining: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  targets: CollaboratorPaymentTarget[];
  submitting?: boolean;
  onSubmit: (input: {
    target: CollaboratorPaymentTarget;
    amount: number;
    paidAt: string;
    paymentSource: string;
    note: string | null;
  }) => void | Promise<void>;
}

const parseAmount = (v: string): number => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const todayISODate = () => new Date().toISOString().slice(0, 10);

export const CollaboratorPaymentDialog = ({
  open,
  onOpenChange,
  displayName,
  targets,
  submitting,
  onSubmit,
}: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { customPaymentSources } = useCustomPaymentSources();

  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(todayISODate());
  const [paymentSource, setPaymentSource] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) {
      setAmount('');
      setNote('');
      setPaymentSource('');
      setPaidAt(todayISODate());
      return;
    }
    setTargetId(targets.length === 1 ? targets[0].collaboratorId : '');
  }, [open, targets]);

  const target = useMemo(
    () => targets.find((x) => x.collaboratorId === targetId) ?? null,
    [targets, targetId],
  );

  const sourceOptions = useMemo(
    () => customPaymentSources.map((s) => ({ value: `custom:${s.id}`, label: s.name })),
    [customPaymentSources],
  );

  const parsed = round2(parseAmount(amount));
  const check = canPay(parsed, target ? target.remaining : null);
  const canSubmit = !!target && !!paymentSource && check.ok && !submitting;

  const submit = async () => {
    if (!canSubmit || !target) return;
    await onSubmit({
      target,
      amount: parsed,
      paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
      paymentSource,
      note: note.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('collaboratorPayment.title', 'Plaćanje — {{name}}', { name: displayName })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {targets.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('collaboratorPayment.engagement', 'Angažman')}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue
                    placeholder={t('collaboratorPayment.engagementPlaceholder', 'Odaberi angažman')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((x) => (
                    <SelectItem key={x.collaboratorId} value={x.collaboratorId}>
                      {[x.projectName, x.serviceDescription].filter(Boolean).join(' · ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {target && (
            <p className="text-xs text-muted-foreground">
              {target.remaining === null
                ? t('collaboratorPayment.noCeiling', 'Dogovoreni iznos nije upisan — nema gornje granice.')
                : t('collaboratorPayment.remainingHint', 'Ostaje: {{amount}}', {
                    amount: formatAmount(target.remaining),
                  })}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('collaboratorPayment.amount', 'Iznos')}</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('collaboratorPayment.date', 'Datum plaćanja')}</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('collaboratorPayment.source', 'Izvor plaćanja')}</Label>
            <Select value={paymentSource} onValueChange={setPaymentSource}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue
                  placeholder={t('people.payout.sourcePlaceholder', 'Odaberi novčanik')}
                />
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

          <div className="space-y-1.5">
            <Label className="text-xs">{t('common.note', 'Napomena')}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          {parsed > 0 && check.reason === 'exceeds_remaining' && (
            <p className="text-xs text-destructive">
              {t('collaboratorPayment.exceeds', 'Iznos je veći od onoga što na angažmanu ostaje.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="min-h-[44px]">
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit} className="min-h-[44px]">
            {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('collaboratorPayment.confirm', 'Plati')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
