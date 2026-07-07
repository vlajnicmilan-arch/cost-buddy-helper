import { useMemo, useState, useEffect } from 'react';
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
import { Loader2, Plus, XCircle, Ban, Download, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import {
  useWorkerPayouts,
  type WorkerPayout,
  type PayoutStatus,
  type PayoutPreview,
  type BatchItemInput,
} from '@/hooks/useWorkerPayouts';
import { exportTextFile } from '@/lib/fileExport';
import { showError } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectWorker } from '@/types/projectWorker';

interface WorkerPayoutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  worker: ProjectWorker | null;
  canManage: boolean;
}

const STATUS_VARIANT: Record<PayoutStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paid: 'default',
  partial: 'secondary',
  advance: 'outline',
  voided: 'destructive',
};

interface CandidateRow {
  worker_id: string;
  project_id: string;
  project_name: string;
  first_name: string;
  last_name: string;
}

interface BatchRowState {
  selected: boolean;
  paidAmount: string;
  preview: PayoutPreview | null;
}

export const WorkerPayoutsDialog = ({
  open,
  onOpenChange,
  projectId,
  worker,
  canManage,
}: WorkerPayoutsDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { payouts, loading, createPayout, createBatchPayout, previewPayout, voidPayout } =
    useWorkerPayouts(open ? projectId : null, open ? worker?.id ?? null : null);
  const { customPaymentSources } = useCustomPaymentSources();

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voidTarget, setVoidTarget] = useState<WorkerPayout | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const now = new Date();
  const defaultStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentSource, setPaymentSource] = useState<string>('');
  const [note, setNote] = useState('');
  const [lockEntries, setLockEntries] = useState(true);
  const [mainPreview, setMainPreview] = useState<PayoutPreview | null>(null);

  // Batch state
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [batchState, setBatchState] = useState<Record<string, BatchRowState>>({});

  const sourceOptions = useMemo(
    () => customPaymentSources.map((s) => ({ value: `custom:${s.id}`, label: s.name })),
    [customPaymentSources],
  );

  // Load main preview when period changes
  useEffect(() => {
    if (!showForm || !worker) { setMainPreview(null); return; }
    if (!periodStart || !periodEnd || periodEnd < periodStart) { setMainPreview(null); return; }
    let cancelled = false;
    previewPayout(worker.id, projectId, periodStart, periodEnd).then((p) => {
      if (!cancelled) setMainPreview(p);
    });
    return () => { cancelled = true; };
  }, [showForm, worker, projectId, periodStart, periodEnd, previewPayout]);

  // Fetch cross-project candidates (same first+last name, owner-scoped via RLS)
  useEffect(() => {
    if (!showForm || !worker) { setCandidates([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from('project_workers')
          .select('id, first_name, last_name, project_id, projects!inner(id, name, user_id)')
          .eq('first_name', worker.first_name)
          .eq('last_name', worker.last_name)
          .neq('id', worker.id);
        if (error) throw error;
        if (cancelled) return;
        const rows: CandidateRow[] = ((data ?? []) as any[])
          .filter((r) => r.projects?.user_id === uid && r.project_id !== projectId)
          .map((r) => ({
            worker_id: r.id,
            project_id: r.project_id,
            project_name: r.projects?.name ?? '',
            first_name: r.first_name,
            last_name: r.last_name,
          }));
        setCandidates(rows);
      } catch (e) {
        console.warn('[WorkerPayoutsDialog] candidates fetch failed:', e);
        setCandidates([]);
      }
    })();
    return () => { cancelled = true; };
  }, [showForm, worker, projectId]);

  // Refresh previews for candidates when period changes (only for selected ones to save calls)
  useEffect(() => {
    if (!showForm) return;
    Object.entries(batchState).forEach(([wid, st]) => {
      if (!st.selected || st.preview) return;
      const cand = candidates.find((c) => c.worker_id === wid);
      if (!cand) return;
      previewPayout(wid, cand.project_id, periodStart, periodEnd).then((p) => {
        setBatchState((prev) => {
          const cur = prev[wid];
          if (!cur) return prev;
          return {
            ...prev,
            [wid]: {
              ...cur,
              preview: p,
              paidAmount: cur.paidAmount || (p ? p.gross.toFixed(2) : ''),
            },
          };
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchState, periodStart, periodEnd, showForm, candidates]);

  const toggleCandidate = (wid: string) => {
    setBatchState((prev) => {
      const cur = prev[wid];
      if (cur) {
        return { ...prev, [wid]: { ...cur, selected: !cur.selected } };
      }
      return { ...prev, [wid]: { selected: true, paidAmount: '', preview: null } };
    });
  };

  const resetForm = () => {
    setPeriodStart(defaultStart);
    setPeriodEnd(defaultEnd);
    setPaidAmount('');
    setPaymentSource('');
    setNote('');
    setLockEntries(true);
    setShowForm(false);
    setMainPreview(null);
    setBatchState({});
  };

  const selectedBatchIds = useMemo(
    () => Object.entries(batchState).filter(([, s]) => s.selected).map(([id]) => id),
    [batchState],
  );

  const handleSubmit = async () => {
    if (!worker) return;
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (!paymentSource) return;

    setSubmitting(true);
    try {
      if (selectedBatchIds.length === 0) {
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
        if (result) resetForm();
      } else {
        const items: BatchItemInput[] = [
          {
            workerId: worker.id,
            projectId,
            periodStart,
            periodEnd,
            paidAmount: amount,
          },
          ...selectedBatchIds
            .map((wid) => {
              const st = batchState[wid];
              const cand = candidates.find((c) => c.worker_id === wid);
              if (!cand) return null;
              const a = Number(st.paidAmount);
              if (!Number.isFinite(a) || a < 0) return null;
              return {
                workerId: wid,
                projectId: cand.project_id,
                periodStart,
                periodEnd,
                paidAmount: a,
              };
            })
            .filter((x): x is BatchItemInput => !!x),
        ];
        const result = await createBatchPayout({
          items,
          paymentSource,
          paidAt: new Date().toISOString(),
          note: note.trim() || null,
          lockEntries,
        });
        if (result) resetForm();
      }
    } finally {
      setSubmitting(false);
    }
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
      'batch_id',
      'period_start', 'period_end', 'status', 'hours_covered',
      'hourly_rate_snapshot', 'gross_amount', 'paid_amount',
      'payment_source', 'paid_at', 'note', 'voided_at', 'void_reason',
    ];
    // Group by batch (batch rows together), singletons after.
    const grouped = [...payouts].sort((a, b) => {
      const ba = a.batch_id ?? `zzz-${a.id}`;
      const bb = b.batch_id ?? `zzz-${b.id}`;
      if (ba === bb) return b.paid_at.localeCompare(a.paid_at);
      return ba.localeCompare(bb);
    });
    const rows = grouped.map((p) => [
      p.batch_id ?? '',
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
                        {p.batch_id && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Layers className="w-3 h-3" />
                            {t('workers.payouts.batchBadge', 'Zbirno')}
                          </Badge>
                        )}
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
                        title={
                          p.batch_id
                            ? t('workers.payouts.voidBatchAction', 'Poništi cijelu zbirnu isplatu')
                            : t('workers.payouts.voidAction', 'Poništi isplatu')
                        }
                      >
                        <Ban className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

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
                      <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">{t('workers.payouts.periodEnd', 'Do')}</Label>
                      <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                    </div>
                  </div>

                  {mainPreview && mainPreview.segments.length > 0 && (
                    <div className="text-xs bg-muted/40 rounded-md p-2 space-y-1">
                      <div className="font-medium">
                        {t('workers.payouts.previewTitle', 'Raščlamba po satnici')}:
                      </div>
                      {mainPreview.segments.map((s, i) => (
                        <div key={i} className="flex justify-between">
                          <span>
                            {s.mind === s.maxd ? s.mind : `${s.mind} → ${s.maxd}`} ·{' '}
                            {s.hh}h × {formatAmount(s.rate)}
                          </span>
                          <span>{formatAmount(s.hh * s.rate)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t pt-1 font-medium">
                        <span>{t('workers.payouts.grossShort', 'Bruto')}</span>
                        <span>{formatAmount(mainPreview.gross)}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">{t('workers.payouts.paidAmount', 'Isplaćeno')}</Label>
                    <Input
                      type="number" inputMode="decimal" step="0.01" min="0"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder={mainPreview ? mainPreview.gross.toFixed(2) : '0.00'}
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
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t('workers.payouts.note', 'Bilješka')}</Label>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder={t('workers.payouts.notePlaceholder', 'Neobavezno...')} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={lockEntries} onCheckedChange={(v) => setLockEntries(v === true)} />
                    <span>{t('workers.payouts.lockEntries', 'Zaključaj radne unose u periodu')}</span>
                  </label>

                  {candidates.length > 0 && (
                    <div className="border rounded-md p-2 space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        {t('workers.payouts.batchSectionTitle', 'Uključi i druge projekte')}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t('workers.payouts.batchSectionHint',
                          'Ista osoba na drugim projektima (isti vlasnik). Odabrani redovi bit će zbirno isplaćeni istim izvorom.')}
                      </div>
                      {candidates.map((c) => {
                        const st = batchState[c.worker_id];
                        const selected = !!st?.selected;
                        return (
                          <div key={c.worker_id} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleCandidate(c.worker_id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{c.project_name}</div>
                              {selected && st?.preview && (
                                <div className="text-[11px] text-muted-foreground">
                                  {st.preview.hours}h · {formatAmount(st.preview.gross)}
                                </div>
                              )}
                            </div>
                            {selected && (
                              <Input
                                type="number" inputMode="decimal" step="0.01" min="0"
                                className="h-7 w-24 text-xs"
                                value={st?.paidAmount ?? ''}
                                onChange={(e) =>
                                  setBatchState((prev) => ({
                                    ...prev,
                                    [c.worker_id]: {
                                      ...(prev[c.worker_id] ?? { selected: true, paidAmount: '', preview: null }),
                                      paidAmount: e.target.value,
                                    },
                                  }))
                                }
                                placeholder={st?.preview ? st.preview.gross.toFixed(2) : '0.00'}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

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
                      {selectedBatchIds.length > 0
                        ? t('workers.payouts.submitBatch', 'Spremi zbirnu isplatu ({{count}})', { count: selectedBatchIds.length + 1 })
                        : t('workers.payouts.submit', 'Spremi isplatu')}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {voidTarget?.batch_id
                ? t('workers.payouts.voidBatchConfirmTitle', 'Poništiti cijelu zbirnu isplatu?')
                : t('workers.payouts.voidConfirmTitle', 'Poništiti isplatu?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {voidTarget?.batch_id
                ? t('workers.payouts.voidBatchConfirmMessage',
                    'Svi troškovi u zbirnoj isplati bit će obrisani, a zaključani unosi ponovno otvoreni.')
                : t('workers.payouts.voidConfirmMessage',
                    'Trošak će biti obrisan, a zaključani radni unosi ponovno otvoreni.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-xs">
              {t('workers.payouts.voidReasonLabel', 'Razlog')} ({t('common.optional', 'neobavezno')})
            </Label>
            <Textarea rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoidConfirm}
              className="bg-destructive text-destructive-foreground"
            >
              <XCircle className="w-4 h-4 mr-2" />
              {voidTarget?.batch_id
                ? t('workers.payouts.voidBatchAction', 'Poništi cijelu zbirnu isplatu')
                : t('workers.payouts.voidAction', 'Poništi isplatu')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
