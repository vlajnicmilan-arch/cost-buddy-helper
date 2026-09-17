/**
 * B — traka „Predaja knjigovodstvu" na polici ulaznih računa.
 *
 * Vidljiva samo kad aktivna tvrtka ima uključen prekidač „predajem knjigovođi".
 * Izvozi PDF i Excel istog sadržaja i bilježi status „predano" po mjesecu.
 * F1/F2 logika se samo čita.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CheckCircle2, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  groupHandoverInvoices,
  packageTotals,
  selectHandoverInvoices,
  vatRecap,
  type HandoverInvoiceLike,
} from '@/lib/eracun/handoverPackage';
import {
  deriveMaterialExpenseFlag,
  type AccountingProfileLite,
  type PaymentSourceLite,
  type ProjectLite,
} from '@/lib/eracun/accountingClassification';
import type { HandoverGroupView, HandoverReportData, HandoverRowView } from '@/lib/eracun/handoverReportTypes';

interface ProjectOption extends ProjectLite {
  id: string;
  name?: string | null;
}

interface HandoverBarProps {
  invoices: readonly HandoverInvoiceLike[];
  projects: readonly ProjectOption[];
  businessProfiles: readonly (AccountingProfileLite & { name?: string | null })[];
  paymentSources: readonly PaymentSourceLite[];
  businessProfileId: string | null;
  /** `payment_source` povezanog troška (`custom:<uuid>`, `cash`, ...). */
  paidExpensePaymentSource: (invoiceId: string) => string | null;
}

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const shiftMonth = (period: string, delta: number): string => {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return monthKey(date);
};

export const HandoverBar = ({
  invoices,
  projects,
  businessProfiles,
  paymentSources,
  businessProfileId,
  paidExpensePaymentSource,
}: HandoverBarProps) => {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState(() => monthKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { markSubmitted, periodFor } = useAccountingHandoverPeriods(businessProfileId);

  const profile = businessProfiles.find((p) => p.id === businessProfileId) ?? null;
  const enabled = profile?.accounting_handover_enabled === true;

  const selection = useMemo(() => {
    if (!businessProfileId || !enabled) return { included: [], missingDate: [] };
    return selectHandoverInvoices({
      invoices,
      projects,
      profiles: businessProfiles,
      businessProfileId,
      period,
    });
  }, [invoices, projects, businessProfiles, businessProfileId, enabled, period]);

  const periodLabel = useMemo(() => {
    const [year, month] = period.split('-').map(Number);
    return new Intl.DateTimeFormat(i18n.language || 'hr', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1));
  }, [period, i18n.language]);

  const categoryLabel = useCallback((category: string | null | undefined): string => {
    if (category === 'project') return t('eracun.accounting.categoryProject', 'Pripadnost projektu');
    if (category === 'tool') return t('eracun.accounting.categoryTool', 'Alat');
    if (category === 'fixed_asset') return t('eracun.accounting.categoryFixedAsset', 'Osnovna sredstva');
    return t('eracun.handover.categoryUnset', 'Bez kategorije');
  }, [t]);

  const toRow = useCallback((invoice: HandoverInvoiceLike): HandoverRowView => {
    const paymentSource = paidExpensePaymentSource(invoice.id);
    const total = Number(invoice.total_amount ?? 0);
    const vat = Number(invoice.vat_amount ?? 0);
    return {
      supplier: invoice.supplier_name ?? '',
      oib: invoice.supplier_oib ?? '',
      invoiceNumber: invoice.invoice_number ?? '',
      issueDate: invoice.issue_date ?? '',
      dueDate: invoice.due_date ?? '',
      base: total - vat,
      vat,
      total,
      paymentMethod: invoice.paid_at
        ? paymentSource === 'cash'
          ? t('eracun.handover.paymentCash', 'Gotovina')
          : paymentSource
            ? t('eracun.handover.paymentCard', 'Kartica / račun')
            : t('eracun.handover.paymentPaid', 'Plaćeno')
        : t('eracun.handover.paymentUnpaid', 'Nije plaćeno'),
      categoryLabel: categoryLabel(invoice.accounting_category),
      material: deriveMaterialExpenseFlag({
        invoice,
        paidExpensePaymentSource: paymentSource,
        sources: paymentSources,
        projects,
      }),
      projectName: projects.find((p) => p.id === invoice.project_id)?.name ?? '',
    };
  }, [categoryLabel, paidExpensePaymentSource, paymentSources, projects, t]);

  const reportData = useCallback((): HandoverReportData => {
    const groups: HandoverGroupView[] = groupHandoverInvoices(selection.included).map((g) => ({
      title: g.kind === 'project'
        ? `${t('eracun.accounting.categoryProject', 'Pripadnost projektu')} · ${
            projects.find((p) => p.id === g.projectId)?.name
            ?? t('eracun.handover.projectUnset', 'Bez projekta')
          }`
        : categoryLabel(g.kind === 'unset' ? null : g.kind),
      rows: g.invoices.map(toRow),
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
        const { exportAccountingHandoverPdf } = await import('@/lib/eracun/handoverPdfExport');
        await exportAccountingHandoverPdf(data);
      } else {
        const { exportAccountingHandoverExcel } = await import('@/lib/eracun/handoverExcelExport');
        await exportAccountingHandoverExcel(data);
      }
    } catch (err) {
      console.error('[handover] export failed', err);
      showError(t('eracun.handover.exportFailed', 'Izrada datoteke nije uspjela: {{reason}}', {
        reason: describeDbError(err, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
      }));
    } finally {
      setBusy(false);
    }
  }, [reportData, t]);

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
      showSuccess(t('eracun.handover.submitted', 'Mjesec je označen kao predan'));
    } catch (err) {
      if (err instanceof Error && err.message === 'refresh_failed') {
        showError(t('eracun.handover.submittedRefreshFailed', 'Predaja je spremljena, ali osvježavanje nije uspjelo.'));
      } else {
        showError(t('eracun.handover.submitFailed', 'Označavanje predaje nije uspjelo: {{reason}}', {
          reason: describeDbError(err, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
        }));
      }
    } finally {
      setBusy(false);
    }
  }, [businessProfileId, selection.included, markSubmitted, period, t]);

  if (!enabled || !businessProfileId) return null;

  const submittedRow = periodFor(period);

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 w-full min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">
          {t('eracun.handover.title', 'Predaja knjigovodstvu')}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            aria-label={t('eracun.handover.prevMonth', 'Prethodni mjesec')}
            onClick={() => setPeriod((p) => shiftMonth(p, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm min-w-[7.5rem] text-center">{periodLabel}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            aria-label={t('eracun.handover.nextMonth', 'Sljedeći mjesec')}
            onClick={() => setPeriod((p) => shiftMonth(p, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Badge variant="secondary" className="text-[11px]">
          {t('eracun.handover.count', '{{count}} računa za predaju', { count: selection.included.length })}
        </Badge>
        {selection.missingDate.length > 0 && (
          <Badge variant="outline" className="text-[11px]">
            {t('eracun.handover.missingDateCount', '{{count}} bez datuma — provjeri', { count: selection.missingDate.length })}
          </Badge>
        )}
        {submittedRow && (
          <Badge className="text-[11px]">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('eracun.handover.submittedAt', 'Predano {{date}}', {
              date: new Date(submittedRow.submitted_at).toLocaleDateString(i18n.language || 'hr'),
            })}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Button size="sm" variant="outline" className="min-h-[36px]" disabled={busy} onClick={() => runExport('pdf')}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1" />}
          PDF
        </Button>
        <Button size="sm" variant="outline" className="min-h-[36px]" disabled={busy} onClick={() => runExport('excel')}>
          <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
          Excel
        </Button>
        <Button
          size="sm"
          className="min-h-[36px]"
          disabled={busy}
          onClick={() => (submittedRow ? setConfirmOpen(true) : submit())}
        >
          {t('eracun.handover.markSubmitted', 'Označi predano')}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('eracun.handover.confirmTitle', 'Mjesec je već predan')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('eracun.handover.confirmDesc', 'Želiš li ponovno označiti {{period}} kao predano?', { period: periodLabel })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); void submit(); }}>
              {t('eracun.handover.markSubmitted', 'Označi predano')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
