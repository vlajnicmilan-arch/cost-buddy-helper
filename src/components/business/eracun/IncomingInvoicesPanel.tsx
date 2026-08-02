import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { showUndoToast } from '@/lib/undoToast';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useWriteGuard } from '@/hooks/useWriteGuard';
import { useIncomingInvoices, type IncomingInvoice } from '@/hooks/useIncomingInvoices';
import { daysUntilDue } from '@/lib/eracun/sortInvoices';
import { EracunImportDialog } from './EracunImportDialog';
import { MarkPaidDialog, type MarkPaidResult } from './MarkPaidDialog';

type Filter = 'unpaid' | 'paid' | 'all';

/**
 * Popis ulaznih računa (eRačun v1).
 *
 * Poredak dolazi iz `sortIncomingInvoices`: neplaćeni prvi, po dospijeću
 * uzlazno; plaćeni iza filtra. Ekran odgovara na pitanje „što me čeka".
 */
export const IncomingInvoicesPanel = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const { addExpense } = useExpenses();
  const { customPaymentSources } = useCustomPaymentSources();
  const { guard } = useWriteGuard({ kind: 'module', feature: 'business_module' });
  const {
    invoices, unpaid, paid, loading, existingFingerprints,
    saveBatch, undoBatch, markPaid, deleteInvoice,
  } = useIncomingInvoices();

  const [filter, setFilter] = useState<Filter>('unpaid');
  const [importOpen, setImportOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<IncomingInvoice | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

  const visible = useMemo(
    () => (filter === 'unpaid' ? unpaid : filter === 'paid' ? paid : invoices),
    [filter, unpaid, paid, invoices],
  );

  const sourceOptions = useMemo(
    () => customPaymentSources.map((s: any) => ({ id: s.id as string, name: s.name as string })),
    [customPaymentSources],
  );

  const handleSaveBatch = useCallback(async (rows: any[], batchId: string) => {
    await guard(async () => {
      try {
        const count = await saveBatch(rows);
        showUndoToast({
          message: t('eracun.import.saved', 'Uvezeno {{n}} ulaznih računa', { n: count }),
          undoLabel: t('eracun.import.undo', 'Poništi uvoz'),
          onUndo: () =>
            undoBatch(batchId)
              .then((removed) => showSuccess(t('eracun.import.undone', 'Poništeno: {{n}}', { n: removed })))
              .catch(() => showError(t('eracun.import.undoFailed', 'Poništavanje nije uspjelo.'))),
        });
      } catch (err: any) {
        if (String(err?.code) === '23505') {
          showError(t('eracun.import.duplicateServer', 'Neki od računa su već uvezeni.'));
        } else {
          showError(t('eracun.import.failed', 'Uvoz nije uspio.'));
        }
        throw err;
      }
    });
  }, [guard, saveBatch, undoBatch, t]);

  const handleConfirmPaid = useCallback(async ({ paymentDate, paymentSource }: MarkPaidResult) => {
    if (!payTarget) return;
    setSavingPayment(true);
    await guard(async () => {
      try {
        const amount = Number(payTarget.total_amount);
        const created: any = await addExpense({
          expense: {
            amount: Math.abs(amount),
            description: t('eracun.paid.expenseDescription', 'Ulazni račun {{number}}', { number: payTarget.invoice_number }),
            category: 'other',
            type: amount < 0 ? 'income' : 'expense',
            date: paymentDate,
            payment_source: paymentSource,
            merchant_name: payTarget.supplier_name,
            business_profile_id: activeBusinessProfileId,
          } as any,
        });
        if (!created?.id) throw new Error('expense_not_created');
        await markPaid(payTarget.id, created.id, paymentDate.toISOString());
        setPayTarget(null);
      } catch {
        showError(t('eracun.paid.failed', 'Bilježenje plaćanja nije uspjelo.'));
      }
    });
    setSavingPayment(false);
  }, [payTarget, guard, addExpense, markPaid, activeBusinessProfileId, t]);

  const dueBadge = (invoice: IncomingInvoice) => {
    if (invoice.paid_at) {
      return (
        <Badge variant="outline" className="text-[10px] gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {t('eracun.list.paidOn', 'Plaćeno {{date}}', {
            date: format(new Date(invoice.paid_at), 'd. MMM yyyy', { locale: hr }),
          })}
        </Badge>
      );
    }
    const days = daysUntilDue(invoice.due_date, new Date());
    if (days === null) {
      return <Badge variant="secondary" className="text-[10px]">{t('eracun.list.noDue', 'Bez dospijeća')}</Badge>;
    }
    if (days < 0) {
      return (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <AlertTriangle className="w-3 h-3" />
          {t('eracun.list.overdue', 'Kasni {{n}} d', { n: Math.abs(days) })}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-[10px]">
        {t('eracun.list.dueIn', 'Za {{n}} d', { n: days })}
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-9">
            <TabsTrigger value="unpaid" className="text-xs">
              {t('eracun.list.unpaid', 'Neplaćeni')} ({unpaid.length})
            </TabsTrigger>
            <TabsTrigger value="paid" className="text-xs">
              {t('eracun.list.paid', 'Plaćeni')} ({paid.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">{t('eracun.list.all', 'Sve')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" className="min-h-[36px]" onClick={() => setImportOpen(true)}>
          <Upload className="w-3.5 h-3.5 mr-1" />
          {t('eracun.importButton', 'Učitaj eRačun (XML)')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {filter === 'unpaid'
            ? t('eracun.list.emptyUnpaid', 'Nema neplaćenih ulaznih računa.')
            : t('eracun.list.empty', 'Još nema uvezenih ulaznih računa.')}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((inv) => (
            <div key={inv.id} className="p-3 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {inv.supplier_name || inv.supplier_oib}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {inv.invoice_number}
                    {inv.due_date ? ` · ${t('eracun.list.due', 'dospijeće')} ${format(new Date(inv.due_date), 'd. MMM yyyy', { locale: hr })}` : ''}
                  </p>
                  <div className="mt-1">{dueBadge(inv)}</div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">{formatAmount(Number(inv.total_amount))}</p>
                  {inv.vat_amount != null && (
                    <p className="text-[10px] text-muted-foreground">
                      {t('eracun.list.vat', 'PDV')} {formatAmount(Number(inv.vat_amount))}
                    </p>
                  )}
                </div>
              </div>

              {!inv.paid_at && (
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => guard(() => deleteInvoice(inv.id))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPayTarget(inv)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {t('eracun.list.markPaid', 'Plaćeno')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {user && (
        <EracunImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          userId={user.id}
          businessProfileId={activeBusinessProfileId}
          existingFingerprints={existingFingerprints}
          onSave={handleSaveBatch}
        />
      )}

      <MarkPaidDialog
        invoice={payTarget}
        onOpenChange={(open) => !open && setPayTarget(null)}
        paymentSources={sourceOptions}
        saving={savingPayment}
        onConfirm={handleConfirmPaid}
      />
    </div>
  );
};
