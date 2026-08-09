import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Link2, Loader2, Trash2, Upload } from 'lucide-react';
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
import { useActiveCompanyOib } from '@/hooks/useActiveCompanyOib';
import { daysUntilDue } from '@/lib/eracun/sortInvoices';
import { describeDbError, describeInvoiceDbError } from '@/lib/eracun/dbError';
import { EracunImportDialog } from './EracunImportDialog';
import { MarkPaidDialog, type MarkPaidResult } from './MarkPaidDialog';
import { MarkCollectedDialog, type MarkCollectedResult } from './MarkCollectedDialog';
import { PaymentMatchReview } from './PaymentMatchReview';

type Filter = 'unpaid' | 'paid' | 'all';
type Direction = 'in' | 'out';

/**
 * Popis eRačuna — dvije strane novca.
 *
 * „Dugujem" (ulazni, `direction = 'in'`) i „Duguju mi" (izlazni, `direction = 'out'`).
 * Unutar svake strane poredak dolazi iz `sortIncomingInvoices`: neplaćeni prvi,
 * po dospijeću uzlazno.
 */
export const IncomingInvoicesPanel = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const { companyOib } = useActiveCompanyOib();
  const { addExpense } = useExpenses();
  const { customPaymentSources } = useCustomPaymentSources();
  const { guard } = useWriteGuard({ kind: 'module', feature: 'business_module' });
  const {
    invoices, loading, existingFingerprints,
    saveBatch, undoBatch, markPaid, markCollected, deleteInvoice, setPlaceLabel, refetch,
  } = useIncomingInvoices();

  const [direction, setDirection] = useState<Direction>('in');
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [importOpen, setImportOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<IncomingInvoice | null>(null);
  const [collectTarget, setCollectTarget] = useState<IncomingInvoice | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

  const scoped = useMemo(
    () => invoices.filter((i) => (i.direction ?? 'in') === direction),
    [invoices, direction],
  );
  const unpaid = useMemo(() => scoped.filter((i) => !i.paid_at), [scoped]);
  const paid = useMemo(() => scoped.filter((i) => !!i.paid_at), [scoped]);

  const visible = useMemo(
    () => (filter === 'unpaid' ? unpaid : filter === 'paid' ? paid : scoped),
    [filter, unpaid, paid, scoped],
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
              .catch((err) => {
              console.error('[eRacun] undoBatch failed', err);
              showError(t('eracun.import.undoFailedDetailed', 'Poništavanje nije uspjelo: {{reason}}', {
                reason: describeDbError(err, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
              }));
            }),
        });
      } catch (err: any) {
        console.error('[eRacun] saveBatch failed', err, { rows: rows.length });
        if (String(err?.code) === '23505') {
          showError(t('eracun.import.duplicateServer', 'Neki od računa su već uvezeni. ({{reason}})', {
            reason: describeDbError(err),
          }));
        } else {
          const numbers = rows
            .map((r: any) => r?.invoice_number)
            .filter(Boolean)
            .slice(0, 5)
            .join(', ');
          showError(t('eracun.import.failedDetailed', 'Uvoz nije uspio: {{reason}}{{where}}', {
            reason: describeDbError(err, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
            where: numbers ? ` (${numbers})` : '',
          }));
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
        if (!created?.id) {
          throw new Error(t('eracun.paid.expenseNotCreated', 'Trošak nije stvoren — spremanje je odbijeno.'));
        }
        await markPaid(payTarget.id, created.id, paymentDate.toISOString());
        setPayTarget(null);
      } catch (err) {
        console.error('[eRacun] markPaid failed', err, { invoiceId: payTarget.id });
        showError(t('eracun.paid.failedDetailed', 'Bilježenje plaćanja nije uspjelo: {{reason}}', {
          reason: describeInvoiceDbError(err, {
            supplier: payTarget.supplier_name,
            invoiceNumber: payTarget.invoice_number,
          }, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
        }));
      }
    });
    setSavingPayment(false);
  }, [payTarget, guard, addExpense, markPaid, activeBusinessProfileId, t]);

  /**
   * Naplata izlaznog računa: samo datum. Bez zapisa u `expenses`, bez prihoda,
   * bez dodira sa saldom — prihod ulazi kroz uvoz bankovnog izvoda.
   */
  const handleConfirmCollected = useCallback(async ({ collectedDate }: MarkCollectedResult) => {
    if (!collectTarget) return;
    setSavingPayment(true);
    await guard(async () => {
      try {
        await markCollected(collectTarget.id, collectedDate.toISOString());
        setCollectTarget(null);
      } catch (err) {
        console.error('[eRacun] markCollected failed', err, { invoiceId: collectTarget.id });
        showError(t('eracun.collected.failedDetailed', 'Bilježenje naplate nije uspjelo: {{reason}}', {
          reason: describeInvoiceDbError(err, {
            supplier: collectTarget.counterparty_name ?? collectTarget.supplier_name,
            invoiceNumber: collectTarget.invoice_number,
          }, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
        }));
      }
    });
    setSavingPayment(false);
  }, [collectTarget, guard, markCollected, t]);

  const handleDelete = useCallback(async (invoice: IncomingInvoice) => {
    try {
      await deleteInvoice(invoice.id);
    } catch (err) {
      console.error('[eRacun] deleteInvoice failed', err, { invoiceId: invoice.id });
      showError(t('eracun.list.deleteFailed', 'Brisanje nije uspjelo: {{reason}}', {
        reason: describeInvoiceDbError(err, {
          supplier: invoice.supplier_name,
          invoiceNumber: invoice.invoice_number,
        }, t('eracun.error.unknownDb', 'Nepoznata greška baze')),
      }));
    }
  }, [deleteInvoice, t]);

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
    <div className="space-y-3 w-full min-w-0 overflow-x-hidden">
      <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)} className="w-full min-w-0">
        <TabsList className="h-9 w-full">
          <TabsTrigger value="in" className="text-xs flex-1 min-w-0">
            {t('eracun.list.directionIn', 'Dugujem')}
          </TabsTrigger>
          <TabsTrigger value="out" className="text-xs flex-1 min-w-0">
            {t('eracun.list.directionOut', 'Duguju mi')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
          className="min-w-0 max-w-full flex-1 basis-full sm:basis-auto"
        >
          <TabsList className="h-9 w-full sm:w-auto">
            <TabsTrigger value="unpaid" className="text-xs flex-1 min-w-0 truncate">
              {direction === 'out'
                ? t('eracun.list.uncollected', 'Nenaplaćeni')
                : t('eracun.list.unpaid', 'Neplaćeni')} ({unpaid.length})
            </TabsTrigger>
            <TabsTrigger value="paid" className="text-xs flex-1 min-w-0 truncate">
              {direction === 'out'
                ? t('eracun.list.collected', 'Naplaćeni')
                : t('eracun.list.paid', 'Plaćeni')} ({paid.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs flex-1 min-w-0 truncate">{t('eracun.list.all', 'Sve')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
          {direction === 'out' && (
            <Button size="sm" variant="outline" className="min-h-[36px] flex-1 sm:flex-none min-w-0" onClick={() => setMatchOpen(true)}>
              <Link2 className="w-3.5 h-3.5 mr-1 shrink-0" />
              <span className="truncate">{t('eracun.match.open', 'Poveži uplate')}</span>
            </Button>
          )}
          <Button size="sm" className="min-h-[36px] flex-1 sm:flex-none min-w-0" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1 shrink-0" />
            <span className="truncate">{t('eracun.importButton', 'Učitaj eRačun (XML)')}</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {filter === 'unpaid'
            ? direction === 'out'
              ? t('eracun.list.emptyUncollected', 'Nema nenaplaćenih izlaznih računa.')
              : t('eracun.list.emptyUnpaid', 'Nema neplaćenih ulaznih računa.')
            : t('eracun.list.empty', 'Još nema uvezenih računa.')}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((inv) => (
            <div key={inv.id} className="p-3 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {inv.counterparty_name || inv.supplier_name || inv.counterparty_oib || inv.supplier_oib}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {inv.invoice_number}
                    {inv.due_date ? ` · ${t('eracun.list.due', 'dospijeće')} ${format(new Date(inv.due_date), 'd. MMM yyyy', { locale: hr })}` : ''}
                  </p>
                  <div className="mt-1">{dueBadge(inv)}</div>
                  {!inv.paid_at && Number(inv.settled_amount ?? 0) > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t('eracun.match.settledOf', 'Plaćeno {{paid}} od {{total}}', {
                        paid: formatAmount(Number(inv.settled_amount)),
                        total: formatAmount(Number(inv.total_amount)),
                      })}
                    </p>
                  )}
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
                    onClick={() => guard(() => handleDelete(inv))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {/* Namjerna asimetrija: ulazni račun na „Plaćeno" stvara trošak,
                      izlazni na „Naplaćeno" bilježi samo datum — prihod dolazi iz
                      uvoza bankovnog izvoda. Ne izjednačavati ta dva toka. */}
                  {(inv.direction ?? 'in') === 'in' ? (
                    <Button size="sm" variant="outline" onClick={() => setPayTarget(inv)}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      {t('eracun.list.markPaid', 'Plaćeno')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setCollectTarget(inv)}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      {t('eracun.list.markCollected', 'Naplaćeno')}
                    </Button>
                  )}
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
          companyOib={companyOib}
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

      <MarkCollectedDialog
        invoice={collectTarget}
        onOpenChange={(open) => !open && setCollectTarget(null)}
        saving={savingPayment}
        onConfirm={handleConfirmCollected}
      />

      <PaymentMatchReview
        open={matchOpen}
        onOpenChange={setMatchOpen}
        invoices={invoices}
        onDone={refetch}
      />
    </div>
  );
};
