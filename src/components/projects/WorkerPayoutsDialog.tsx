import { useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, XCircle, Ban, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useWorkerPayouts, type WorkerPayout, type PayoutStatus } from '@/hooks/useWorkerPayouts';
import { exportTextFile } from '@/lib/fileExport';
import { showError } from '@/hooks/useStatusFeedback';
import type { ProjectWorker } from '@/types/projectWorker';

interface WorkerPayoutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  worker: ProjectWorker | null;
  /** Owner + subscription gate. When false, form/actions are hidden. */
  canManage: boolean;
}

const STATUS_VARIANT: Record<PayoutStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  partial: 'secondary',
  advance: 'outline',
  voided: 'destructive',
};

export const WorkerPayoutsDialog = ({
  open,
  onOpenChange,
  projectId,
  worker,
  canManage,
}: WorkerPayoutsDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { payouts, loading, createPayout, voidPayout } = useWorkerPayouts(
    open ? projectId : null,
    open ? worker?.id ?? null : null,
  );
  const { customPaymentSources } = useCustomPaymentSources();

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voidTarget, setVoidTarget] = useState<WorkerPayout | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Form state
  const now = new Date();
  const defaultStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentSource, setPaymentSource] = useState<string>('');
  const [note, setNote] = useState('');
  const [lockEntries, setLockEntries] = useState(true);

  const sourceOptions = useMemo(
    () => customPaymentSources.map((s) => ({ value: `custom:${s.id}`, label: s.name })),
    [customPaymentSources],
  );

  const resetForm = () => {
    setPeriodStart(defaultStart);
    setPeriodEnd(defaultEnd);
    setPaidAmount('');
    setPaymentSource('');
    setNote('');
    setLockEntries(true);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!worker) return;
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (!paymentSource) return;
    setSubmitting(true);
    const result = await createPayout({
      workerId: worker.id,
      projectId,
      periodStart,
      periodEnd,
      paidAmount: amount,
      paymentSource,
      paidAt: new Date().toISOString(),
      note: note.trim() || null,
      lockEntries,
    });
    setSubmitting(false);
    if (result) resetForm();
  };

  const handleVoidConfirm = async () => {
    if (!voidTarget) return;
    const ok = await voidPayout(voidTarget.id, voidReason.trim() || undefined);
    if (ok) {
      setVoidTarget(null);
      setVoidReason('');
    }
  };

  const canSubmit =
    !!worker &&
    !!paymentSource &&
    !!periodStart &&
    !!periodEnd &&
    periodEnd >= periodStart &&
    Number(paidAmount) >= 0 &&
    paidAmount !== '';

  const handleExportCsv = async () => {
    if (!worker || payouts.length === 0) return;
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      'period_start', 'period_end', 'status', 'hours_covered',
      'hourly_rate_snapshot', 'gross_amount', 'paid_amount',
      'payment_source', 'paid_at', 'note', 'voided_at', 'void_reason',
    ];
    const rows = payouts.map((p) => [
      p.period_start, p.period_end, p.status,
      Number(p.hours_covered).toFixed(2),
      Number(p.hourly_rate_snapshot).toFixed(2),
      Number(p.gross_amount).toFixed(2),
      Number(p.paid_amount).toFixed(2),
      p.payment_source ?? '',
      p.paid_at,
      p.note ?? '',
      p.voided_at ?? '',
      p.void_reason ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
    const fileName = `isplate_${worker.last_name}_${worker.first_name}_${new Date().toISOString().slice(0, 10)}.csv`;
    const ok = await exportTextFile(csv, fileName, 'text/csv', true);
    if (!ok) showError(t('common.error'));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span>
                {t('workers.payouts.dialogTitle', 'Isplate')}
                {worker && (
                  <span className="ml-2 text-sm text-muted-foreground font-normal">
                    {worker.first_name} {worker.last_name}
                  </span>
                )}
              </span>
              {payouts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs font-normal"
                  onClick={handleExportCsv}
                  title={t('workers.payouts.exportCsv', 'Izvezi CSV')}
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* List */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : payouts.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {t('workers.payouts.empty', 'Nema evidentiranih isplata')}
              </div>
            ) : (
              payouts.map((p) => (
                <Card key={p.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={STATUS_VARIANT[p.status]} className="text-[10px]">
                          {t(`workers.payouts.status.${p.status}`, p.status)}
                        </Badge>
                        <span className="text-sm font-medium">{formatAmount(p.paid_amount)}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.period_start} → {p.period_end}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('workers.payouts.hoursShort', 'Sati')}: {Number(p.hours_covered).toFixed(1)} ·{' '}
                        {t('workers.payouts.grossShort', 'Bruto')}: {formatAmount(p.gross_amount)}
                      </div>
                      {p.note && <div className="text-xs mt-1 truncate">{p.note}</div>}
                      {p.status === 'voided' && p.void_reason && (
                        <div className="text-xs text-destructive mt-1">
                          {t('workers.payouts.voidReasonLabel', 'Razlog')}: {p.void_reason}
                        </div>
                      )}
                    </div>
                    {canManage && p.status !== 'voided' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setVoidTarget(p)}
                        title={t('workers.payouts.voidAction', 'Poništi isplatu')}
                      >
                        <Ban className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* New payout form (owner + subscriber only) */}
          {canManage && (
            <div className="pt-2 border-t">
              {!showForm ? (
                <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('workers.payouts.newButton', 'Nova isplata')}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{t('workers.payouts.periodStart', 'Od')}</Label>
                      <Input
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('workers.payouts.periodEnd', 'Do')}</Label>
                      <Input
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">{t('workers.payouts.paidAmount', 'Isplaćeno')}</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('workers.payouts.paymentSource', 'Izvor isplate')}</Label>
                    <Select value={paymentSource} onValueChange={setPaymentSource}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('workers.payouts.paymentSourcePlaceholder', 'Odaberi izvor')} />
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
                  <div>
                    <Label className="text-xs">{t('workers.payouts.note', 'Bilješka')}</Label>
                    <Textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('workers.payouts.notePlaceholder', 'Neobavezno...')}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={lockEntries}
                      onCheckedChange={(v) => setLockEntries(v === true)}
                    />
                    <span>{t('workers.payouts.lockEntries', 'Zaključaj radne unose u periodu')}</span>
                  </label>
                  <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="ghost" onClick={resetForm} disabled={submitting}>
                      {t('common.cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                      {submitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      {t('workers.payouts.submit', 'Spremi isplatu')}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void confirm */}
      <AlertDialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('workers.payouts.voidConfirmTitle', 'Poništiti isplatu?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'workers.payouts.voidConfirmMessage',
                'Trošak će biti obrisan, a zaključani radni unosi ponovno otvoreni.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-xs">
              {t('workers.payouts.voidReasonLabel', 'Razlog')} (
              {t('common.optional', 'neobavezno')})
            </Label>
            <Textarea
              rows={2}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoidConfirm}
              className="bg-destructive text-destructive-foreground"
            >
              <XCircle className="w-4 h-4 mr-2" />
              {t('workers.payouts.voidAction', 'Poništi isplatu')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
