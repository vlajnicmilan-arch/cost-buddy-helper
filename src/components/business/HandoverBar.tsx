/**
 * Traka „Predaja knjigovodstvu" na ekranu poslovnih transakcija.
 *
 * Paket sadrži samo fotografirane/skenirane poslovne račune (troškove sa
 * slikom) odabrane tvrtke i mjeseca. Vidljiva je samo kad tvrtka ima
 * uključen prekidač „Predajem ulazne račune knjigovođi".
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CheckCircle2, FileArchive, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { describeDbError } from '@/lib/eracun/dbError';
import { useAccountingHandoverPeriods } from '@/hooks/useAccountingHandoverPeriods';
import { useHandoverExpenses } from '@/hooks/useHandoverExpenses';
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';
import { useProjects } from '@/hooks/useProjects';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import {
  deriveMaterialExpenseFlag,
  groupHandoverExpenses,
  packageTotals,
  resolveExpenseAccountingCategory,
  selectHandoverExpenses,
  vatRecap,
  type HandoverExpenseLike,
} from '@/lib/accounting/handoverPackage';
import type { HandoverGroupView, HandoverReportData, HandoverRowView } from '@/lib/accounting/handoverReportTypes';
import type { ZipProblem } from '@/lib/accounting/handoverZipExport';

interface HandoverBarProps {
  businessProfileId: string | null;
}

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const shiftMonth = (period: string, delta: number): string => {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return monthKey(date);
};

export const HandoverBar = ({ businessProfileId }: HandoverBarProps) => {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState(() => monthKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [zipProblems, setZipProblems] = useState<ZipProblem[]>([]);

  const { profiles } = useBusinessProfiles();
  const { allProjects } = useProjects();
  const { customPaymentSources } = useCustomPaymentSources();
  const { expenses, setExpenseAccountingCategory } = useHandoverExpenses(businessProfileId);
  const { markSubmitted, periodFor } = useAccountingHandoverPeriods(businessProfileId);

  const profile = profiles.find((p) => p.id === businessProfileId) ?? null;
  const enabled = profile?.accounting_handover_enabled === true;

  const projects = useMemo(
    () => allProjects.map((p) => ({ id: p.id, name: p.name, business_profile_id: p.business_profile_id ?? null })),
    [allProjects],
  );

  const selection = useMemo(() => {
    if (!businessProfileId || !enabled) return { included: [], missingDate: [] };
    return selectHandoverExpenses({ expenses, projects, businessProfileId, period });
  }, [expenses, projects, businessProfileId, enabled, period]);

  const periodLabel = useMemo(() => {
    const [year, month] = period.split('-').map(Number);
    return new Intl.DateTimeFormat(i18n.language || 'hr', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1));
  }, [period, i18n.language]);

  const unknownReason = t('accounting.handover.unknownError', 'Nepoznata greška');

  const categoryValueLabel = useCallback((category: string): string => {
    if (category === 'project') return t('accounting.handover.categoryProject', 'Pripadnost projektu');
    if (category === 'tool') return t('accounting.handover.categoryTool', 'Alat');
    if (category === 'fixed_asset') return t('accounting.handover.categoryFixedAsset', 'Osnovna sredstva');
    return t('accounting.handover.categoryUnset', 'Bez kategorije');
  }, [t]);

  const categoryLabel = useCallback((expense: HandoverExpenseLike): string =>
    categoryValueLabel(resolveExpenseAccountingCategory(expense)),
  [categoryValueLabel]);

  const paymentLabel = useCallback((expense: HandoverExpenseLike): string => {
    const source = expense.payment_source;
    if (!source) return '';
    if (source === 'cash') return t('accounting.handover.paymentCash', 'Gotovina');
    if (source.startsWith('custom:')) {
      const id = source.slice('custom:'.length);
      const found = customPaymentSources.find((s) => s.id === id);
      return found?.name ?? t('accounting.handover.paymentCard', 'Kartica / račun');
    }
    return source;
  }, [customPaymentSources, t]);

  const toRow = useCallback((expense: HandoverExpenseLike): HandoverRowView => {
    const total = Number(expense.amount ?? 0);
    const vat = Number(expense.vat_amount ?? 0);
    return {
      supplier: expense.merchant_name ?? '',
      oib: '',
      invoiceNumber: '',
      issueDate: expense.date ?? '',
      dueDate: '',
      base: total - vat,
      vat,
      total,
      paymentMethod: paymentLabel(expense),
      categoryLabel: categoryLabel(expense),
      material: businessProfileId
        ? deriveMaterialExpenseFlag({ expense, sources: customPaymentSources, businessProfileId })
        : false,
      projectName: projects.find((p) => p.id === expense.project_id)?.name ?? '',
    };
  }, [businessProfileId, categoryLabel, customPaymentSources, paymentLabel, projects]);

  const reportData = useCallback((): HandoverReportData => {
    const groups: HandoverGroupView[] = groupHandoverExpenses(selection.included).map((g) => ({
      title: g.kind === 'project'
        ? `${t('accounting.handover.categoryProject', 'Pripadnost projektu')} · ${
            projects.find((p) => p.id === g.projectId)?.name
            ?? t('accounting.handover.projectUnset', 'Bez projekta')
          }`
        : categoryLabel(g.kind === 'unset' ? { accounting_category: null } : { accounting_category: g.kind }),
      rows: g.expenses.map(toRow),
      total: g.total,
      vat: g.vat,
    }));
    return {
      companyName: profile?.name ?? '',
      periodLabel,
      period,
      currency: selection.included[0]?.currency ?? 'EUR',
      groups,
      vatRecap: vatRecap(selection.included),
      totals: packageTotals(selection.included),
      missingDate: selection.missingDate.map(toRow),
    };
  }, [selection, projects, profile, periodLabel, period, toRow, categoryLabel, t]);

  const runExport = useCallback(async (kind: 'pdf' | 'excel') => {
    setBusy(true);
    try {
      const data = reportData();
      if (kind === 'pdf') {
        const { exportAccountingHandoverPdf } = await import('@/lib/accounting/handoverPdfExport');
        await exportAccountingHandoverPdf(data);
      } else {
        const { exportAccountingHandoverExcel } = await import('@/lib/accounting/handoverExcelExport');
        await exportAccountingHandoverExcel(data);
      }
    } catch (err) {
      showError(t('accounting.handover.exportFailed', 'Izrada datoteke nije uspjela: {{reason}}', {
        reason: describeDbError(err, unknownReason),
      }));
    } finally {
      setBusy(false);
    }
  }, [reportData, t, unknownReason]);

  const runZip = useCallback(async () => {
    if (!businessProfileId) return;
    setBusy(true);
    setZipProblems([]);
    try {
      const { exportHandoverOriginalsZip } = await import('@/lib/accounting/handoverZipExport');
      const result = await exportHandoverOriginalsZip(
        selection.included,
        profile?.name ?? '',
        period,
      );
      setZipProblems(result.problems);
      if (result.problems.length > 0) {
        showError(t('accounting.handover.zipProblems', 'ZIP je spreman, ali {{count}} računa nema original — provjeri popis.', {
          count: result.problems.length,
        }));
      } else {
        showSuccess(t('accounting.handover.zipDone', 'ZIP originala je spreman'));
      }
    } catch (err) {
      showError(t('accounting.handover.exportFailed', 'Izrada datoteke nije uspjela: {{reason}}', {
        reason: describeDbError(err, unknownReason),
      }));
    } finally {
      setBusy(false);
    }
  }, [businessProfileId, selection.included, profile, period, t, unknownReason]);

  const changeCategory = useCallback(async (expense: HandoverExpenseLike, value: string) => {
    const category = value === 'tool' || value === 'fixed_asset' ? value : null;
    try {
      await setExpenseAccountingCategory({ expenseId: expense.id, category });
      showSuccess(t('accounting.handover.categorySaved', 'Kategorija je spremljena'));
    } catch (err) {
      if (err instanceof Error && err.message === 'refresh_failed') {
        showError(t('accounting.handover.categorySavedRefreshFailed', 'Kategorija je spremljena, ali osvježavanje popisa nije uspjelo.'));
      } else {
        showError(t('accounting.handover.categorySaveFailed', 'Spremanje kategorije nije uspjelo: {{reason}}', {
          reason: describeDbError(err, unknownReason),
        }));
      }
    }
  }, [setExpenseAccountingCategory, t, unknownReason]);

  const submit = useCallback(async () => {
    if (!businessProfileId) return;
    setBusy(true);
    try {
      const totals = packageTotals(selection.included);
      await markSubmitted({
        businessProfileId,
        period,
        invoiceCount: totals.count,
        totalAmount: totals.total,
      });
      showSuccess(t('accounting.handover.submitted', 'Mjesec je označen kao predan'));
    } catch (err) {
      if (err instanceof Error && err.message === 'refresh_failed') {
        showError(t('accounting.handover.submittedRefreshFailed', 'Predaja je spremljena, ali osvježavanje nije uspjelo.'));
      } else {
        showError(t('accounting.handover.submitFailed', 'Označavanje predaje nije uspjelo: {{reason}}', {
          reason: describeDbError(err, unknownReason),
        }));
      }
    } finally {
      setBusy(false);
    }
  }, [businessProfileId, selection.included, markSubmitted, period, t, unknownReason]);

  if (!enabled || !businessProfileId) return null;

  const submittedRow = periodFor(period);

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 w-full min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">
          {t('accounting.handover.title', 'Predaja knjigovodstvu')}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            aria-label={t('accounting.handover.prevMonth', 'Prethodni mjesec')}
            onClick={() => setPeriod((p) => shiftMonth(p, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm min-w-[7.5rem] text-center">{periodLabel}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            aria-label={t('accounting.handover.nextMonth', 'Sljedeći mjesec')}
            onClick={() => setPeriod((p) => shiftMonth(p, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Badge variant="secondary" className="text-[11px]">
          {t('accounting.handover.count', '{{count}} računa za predaju', { count: selection.included.length })}
        </Badge>
        {selection.missingDate.length > 0 && (
          <Badge variant="outline" className="text-[11px]">
            {t('accounting.handover.missingDateCount', '{{count}} bez datuma — provjeri', { count: selection.missingDate.length })}
          </Badge>
        )}
        {submittedRow && (
          <Badge className="text-[11px]">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('accounting.handover.submittedAt', 'Predano {{date}}', {
              date: new Date(submittedRow.submitted_at).toLocaleDateString(i18n.language || 'hr'),
            })}
          </Badge>
        )}
      </div>

      {selection.included.length > 0 && (
        <div className="space-y-1.5">
          {selection.included.map((expense) => {
            const resolved = resolveExpenseAccountingCategory(expense);
            const material = deriveMaterialExpenseFlag({
              expense,
              sources: customPaymentSources,
              businessProfileId,
            });
            return (
              <div key={expense.id} className="flex items-center gap-2 min-w-0">
                <span className="text-xs truncate flex-1">
                  {expense.merchant_name ?? expense.description ?? ''}
                  {material && (
                    <span className="text-muted-foreground"> · {t('accounting.handover.materialExpense', 'materijalni trošak')}</span>
                  )}
                </span>
                <Select
                  value={resolved === 'tool' || resolved === 'fixed_asset' ? resolved : 'auto'}
                  onValueChange={(value) => void changeCategory(expense, value)}
                >
                  <SelectTrigger
                    className="h-8 w-[9.5rem] text-xs"
                    aria-label={t('accounting.handover.categoryLabel', 'Knjigovodstvena kategorija')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{categoryLabel(expense)}</SelectItem>
                    <SelectItem value="tool">{t('accounting.handover.categoryTool', 'Alat')}</SelectItem>
                    <SelectItem value="fixed_asset">{t('accounting.handover.categoryFixedAsset', 'Osnovna sredstva')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}

      {zipProblems.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-2 space-y-0.5">
          {zipProblems.map((problem) => (
            <p key={problem.expenseId} className="text-[11px] text-warning">
              {problem.supplier || problem.expenseId} — {problem.reason === 'no_file'
                ? t('accounting.handover.problemNoFile', 'bez slike — provjeri')
                : t('accounting.handover.problemProcessing', 'neuspjela obrada — provjeri')}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Button size="sm" variant="outline" className="min-h-[36px]" disabled={busy} onClick={() => runExport('pdf')}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1" />}
          PDF
        </Button>
        <Button size="sm" variant="outline" className="min-h-[36px]" disabled={busy} onClick={() => runExport('excel')}>
          <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
          Excel
        </Button>
        <Button size="sm" variant="outline" className="min-h-[36px]" disabled={busy} onClick={() => void runZip()}>
          <FileArchive className="w-3.5 h-3.5 mr-1" />
          {t('accounting.handover.zipOriginals', 'ZIP originala')}
        </Button>
        <Button
          size="sm"
          className="min-h-[36px]"
          disabled={busy}
          onClick={() => (submittedRow ? setConfirmOpen(true) : void submit())}
        >
          {t('accounting.handover.markSubmitted', 'Označi predano')}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('accounting.handover.confirmTitle', 'Mjesec je već predan')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('accounting.handover.confirmDesc', 'Želiš li ponovno označiti {{period}} kao predano?', { period: periodLabel })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); void submit(); }}>
              {t('accounting.handover.markSubmitted', 'Označi predano')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
