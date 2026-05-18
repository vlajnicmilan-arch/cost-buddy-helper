import { useState, lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectInvoices, ProjectInvoice, InvoiceStatus } from '@/hooks/useProjectInvoices';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAppState } from '@/contexts/AppStateContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { Plus, FileText, Loader2, Edit, Trash2, Download, AlertTriangle, CheckCircle2, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import { showError } from '@/hooks/useStatusFeedback';
import { friendlyError } from '@/lib/errorMessages';
import { SendInvoiceReminderDialog } from '@/components/business/SendInvoiceReminderDialog';
import { useSoftDeleteWithUndo } from '@/hooks/useSoftDeleteWithUndo';

// Lazy heavy dialog
const InvoiceDialog = lazy(() => import('./InvoiceDialog').then(m => ({ default: m.InvoiceDialog })));

const STATUS_VARIANTS: Record<InvoiceStatus | 'overdue', 'secondary' | 'default' | 'outline' | 'destructive'> = {
  issued: 'default',
  partially_paid: 'secondary',
  paid: 'outline',
  cancelled: 'secondary',
  overdue: 'destructive',
};

interface ProjectInvoicesPanelProps {
  /** When provided, only invoices linked to this project are shown. */
  projectId?: string;
  /** Hide the title row (caller renders its own header). */
  compact?: boolean;
}

export const ProjectInvoicesPanel = ({ projectId, compact = false }: ProjectInvoicesPanelProps = {}) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { activeBusinessProfileId } = useAppState();
  const { invoices, payments, loading, deleteInvoice, updateInvoice, getEffectiveStatus, refetch } = useProjectInvoices();
  const wrapDeleteWithUndo = useSoftDeleteWithUndo({ onRestored: refetch });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ProjectInvoice | null>(null);
  const [toDelete, setToDelete] = useState<ProjectInvoice | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [reminderInvoice, setReminderInvoice] = useState<ProjectInvoice | null>(null);
  const noBusinessCtx = !activeBusinessProfileId;

  const visibleInvoices = useMemo(() => {
    if (!projectId) return invoices;
    return invoices.filter(i => i.project_id === projectId);
  }, [invoices, projectId]);

  const handleDownloadPdf = async (inv: ProjectInvoice) => {
    setPdfBusyId(inv.id);
    try {
      await generateInvoicePdf(inv, { paid: payments[inv.id]?.paid ?? 0 });
    } catch (err) {
      showError(friendlyError(err, 'errors.generic'));
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {t('invoices.title', 'Računi (evidencija)')}
          </h3>
          <Button
            size="sm"
            onClick={() => { setEditingInvoice(null); setDialogOpen(true); }}
            disabled={noBusinessCtx}
            title={noBusinessCtx ? t('invoices.errors.noBusinessContext', 'Računi se mogu kreirati samo u kontekstu tvrtke. Prebaci se na tvrtku na dashboardu.') : undefined}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('invoices.add', 'Novi račun')}
          </Button>
        </div>
      )}
      {compact && (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditingInvoice(null); setDialogOpen(true); }}
            disabled={noBusinessCtx}
            title={noBusinessCtx ? t('invoices.errors.noBusinessContext', 'Računi se mogu kreirati samo u kontekstu tvrtke. Prebaci se na tvrtku na dashboardu.') : undefined}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('invoices.add', 'Novi račun')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleInvoices.length === 0 ? (
        <EmptyState
          variant="generic"
          title={t('invoices.empty', 'Nema računa')}
          description={noBusinessCtx
            ? t('invoices.errors.noBusinessContext', 'Računi se mogu kreirati samo u kontekstu tvrtke. Prebaci se na tvrtku na dashboardu.')
            : projectId
              ? t('invoices.emptyForProject', 'Nema računa vezanih za ovaj projekt.')
              : t('invoices.emptyHint', 'Evidentirajte izdane račune i pratite uplate. Plaćanja vežite na transakcije prihoda.')}
        />
      ) : (
        <div className="space-y-2">
          {visibleInvoices.map((inv) => {
            const effStatus = getEffectiveStatus(inv);
            const pay = payments[inv.id];
            const paidAmount = pay?.paid || 0;
            const total = Number(inv.total_amount) || 0;
            const pct = total > 0 ? Math.min(100, Math.round((paidAmount / total) * 100)) : 0;
            return (
              <div key={inv.id} className="p-3 rounded-lg border bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{inv.invoice_number}</p>
                      <Badge variant={STATUS_VARIANTS[effStatus]} className="text-[10px] gap-1">
                        {effStatus === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                        {effStatus === 'paid' && <CheckCircle2 className="w-3 h-3" />}
                        {t(`invoices.status.${effStatus}`, effStatus)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{inv.client_name}</p>
                    <p className="text-xs mt-1">
                      {format(new Date(inv.issue_date), 'd. MMM yyyy', { locale: hr })}
                      {inv.due_date && (
                        <span className="text-muted-foreground ml-2">
                          · {t('invoices.dueShort', 'dospijeće')} {format(new Date(inv.due_date), 'd. MMM yyyy', { locale: hr })}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatAmount(total)}</p>
                    {paidAmount > 0 && paidAmount < total && (
                      <p className="text-[11px] text-muted-foreground">
                        {t('invoices.paid', 'Plaćeno')}: {formatAmount(paidAmount)} ({pct}%)
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 flex-wrap justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadPdf(inv)}
                    disabled={pdfBusyId === inv.id}
                    title={t('invoices.downloadPdf', 'Preuzmi PDF')}
                  >
                    {pdfBusyId === inv.id
                      ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      : <Download className="w-3.5 h-3.5 mr-1" />}
                    PDF
                  </Button>
                  {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReminderInvoice(inv)}
                        title={t('invoices.reminder.send', 'Pošalji podsjetnik')}
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateInvoice(inv.id, { status: 'paid' })}
                        title={t('invoices.markPaid', 'Označi plaćeno')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {t('invoices.markPaid', 'Plaćeno')}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setEditingInvoice(inv); setDialogOpen(true); }}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setToDelete(inv)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen && (
        <Suspense fallback={null}>
          <InvoiceDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            invoice={editingInvoice}
            projectId={projectId}
          />
        </Suspense>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('invoices.deleteTitle', 'Obriši račun?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDelete', 'Ova radnja je nepovratna.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (toDelete) { const id = toDelete.id; await wrapDeleteWithUndo(() => deleteInvoice(id), 'invoice', id); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground"
            >
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendInvoiceReminderDialog
        invoice={reminderInvoice ? { ...reminderInvoice, remaining: (Number(reminderInvoice.total_amount) || 0) - (payments[reminderInvoice.id]?.paid || 0) } : null}
        onOpenChange={(o) => !o && setReminderInvoice(null)}
      />
    </div>
  );
};
