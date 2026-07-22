import { useState } from 'react';
import { isCorrectionInBulkError, emitBulkCorrectionsSkipped } from '@/lib/correctionDeleteGuard';

import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { CustomPaymentSourcesPanel } from '@/components/custom-payment-sources/CustomPaymentSourcesPanel';
import { CustomCategoriesPanel } from '@/components/custom-categories/CustomCategoriesPanel';
import { BankConnection } from '@/components/BankConnection';
import { OpenBankingPanel } from '@/components/OpenBankingPanel';
import { BackupRestore } from '@/components/BackupRestore';
import { InstallmentsPanel } from '@/components/installments';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { useExpenses } from '@/hooks/useExpenses';
import { PaymentSourceTransactionsDialog } from '@/components/PaymentSourceTransactionsDialog';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useCallback } from 'react';
import { useBackButton } from '@/hooks/useBackButton';
import { BACK_PRIORITY } from '@/contexts/BackButtonContext';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { SavingsGoalsSection } from '@/components/savings';
import { CashflowForecast } from '@/components/CashflowForecast';
import { useAppState } from '@/contexts/AppStateContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { WalletTransfersCard } from '@/components/wallet/WalletTransfersCard';
import { TransferListDialog } from '@/components/TransferListDialog';
import { useMemo } from 'react';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { setPendingHighlight } from '@/lib/pendingHighlight';
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

const Wallet = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    importFromCSV, findDuplicates, refetch, isLocalMode, allExpenses, rawExpenses,
    updateExpense, deleteExpense, monthlyTransfers, monthlyTransferCount, totalTransfers,
  } = useExpenses();
  
  const { customPaymentSources } = useCustomPaymentSources();
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<CustomPaymentSource | null>(null);
  const [paymentSourceDialogOpen, setPaymentSourceDialogOpen] = useState(false);
  const [paymentSourcePdfProcessing, setPaymentSourcePdfProcessing] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  // WS2 / Faza 2.1 + 2.2 — deep link parametri: `openSourceCreate` otvara Add dialog
  // za novi izvor (empty-state CTA iz AttributionSheet); `voidedAttribution` prikazuje
  // AlertDialog s CTA "Ukloni pripis" nad prethodno highlightaom transakcijom.
  const autoOpenNewSource = searchParams.get('openSourceCreate') === '1';
  const voidedAttribution = searchParams.get('voidedAttribution') === '1';
  const [voidedPromptExpenseId, setVoidedPromptExpenseId] = useState<string | null>(null);
  const [voidedPromptRemoving, setVoidedPromptRemoving] = useState(false);

  const allTransfers = useMemo(
    () => allExpenses.filter(e => e.type === 'transfer').sort((a, b) => b.date.getTime() - a.date.getTime()),
    [allExpenses]
  );

  useBackButton(transferDialogOpen, () => setTransferDialogOpen(false), BACK_PRIORITY.DIALOG);

  useBackButton(paymentSourceDialogOpen, () => {
    if (paymentSourcePdfProcessing) return;
    setPaymentSourceDialogOpen(false);
  }, BACK_PRIORITY.DIALOG);

  // Wrap importFromCSV so wallet list (balances, transactions) refetches after a successful import.
  const importFromCSVWithRefetch = useCallback(async (
    txs: Parameters<typeof importFromCSV>[0],
    opts?: Parameters<typeof importFromCSV>[1],
  ) => {
    await importFromCSV(txs, opts);
    refetch();
  }, [importFromCSV, refetch]);

  const bulkDeleteWithoutUndo = useCallback(async (ids: string[]) => {
    // Serijalizirano: paralelni delete-i bi pročitali isti currentBalance prije upisa
    // i izgubili sve osim zadnje korekcije (lost-update race za isti payment_source).
    let ok = 0;
    let fail = 0;
    const skippedCorrections: string[] = [];
    for (const id of ids) {
      try {
        await deleteExpense(id, { silent: true });
        ok++;
      } catch (e) {
        if (isCorrectionInBulkError(e)) skippedCorrections.push(id);
        else fail++;
      }
    }
    if (skippedCorrections.length > 0) {
      emitBulkCorrectionsSkipped(skippedCorrections.length, skippedCorrections);
      showError(t('correctionDelete.bulkSkipped', { count: skippedCorrections.length }));
    }
    refetch();
    if (fail === 0 && ok > 0) showSuccess(t('transactions.bulkDeleted', { count: ok }));
    else if (fail === 0 && ok === 0 && skippedCorrections.length === 0) return;
    else if (ok === 0 && fail > 0) showError(t('transactions.bulkDeleteFailed', { count: fail }));
    else if (fail > 0) showError(t('transactions.bulkDeletePartial', { ok, fail }));
  }, [deleteExpense, refetch, t]);


  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  // BUG B fix — `?highlight=<expense_id>` deep link:
  // otvori PaymentSourceTransactionsDialog za izvor te transakcije i postavi
  // pendingHighlight (`expense:<id>`) — HighlightTarget će uhvatiti DOM marker
  // (`data-highlight-id="expense:<id>"` na TransactionItem) čim se lista mount-a,
  // scrollati je u vidno polje i pulsati je. Deep link koristi AttributionSheet
  // voided flow ("Otvori pripisan unos") i sve buduće `/wallet?highlight=` linkove.
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId) return;
    // Čekaj dok podaci ne budu spremni — rawExpenses/customPaymentSources dolaze async.
    if (rawExpenses.length === 0 || customPaymentSources.length === 0) return;

    const expense = rawExpenses.find(e => e.id === highlightId);
    if (!expense || !expense.payment_source) {
      // Transakcija ne postoji ili nije vezana za custom izvor → očisti param.
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('highlight');
        return next;
      }, { replace: true });
      return;
    }
    const sourceId = expense.payment_source.startsWith('custom:')
      ? expense.payment_source.slice(7)
      : expense.payment_source;
    const source = customPaymentSources.find(s => s.id === sourceId);
    if (!source) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('highlight');
        return next;
      }, { replace: true });
      return;
    }
    setPendingHighlight(
      { type: 'expense', id: highlightId, tab: null },
      '/wallet',
    );
    setSelectedPaymentSource(source);
    setPaymentSourceDialogOpen(true);
    // WS2 / Faza 2.2 — ako smo stigli iz storno obavijesti (voidedAttribution=1),
    // memoriramo expense id za AlertDialog "Ukloni pripis". Ne otvaramo prompt
    // prije nego što je izvor pronađen (sprječava mrtav prompt na već obrisan red).
    if (voidedAttribution) {
      setVoidedPromptExpenseId(highlightId);
    }
    // Očisti query paramove nakon što smo pokrenuli protok — highlight odrađuje
    // HighlightTarget preko pendingHighlight state-a; dodatni re-run nije potreban.
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('highlight');
      next.delete('voidedAttribution');
      return next;
    }, { replace: true });
  }, [searchParams, rawExpenses, customPaymentSources, setSearchParams, voidedAttribution]);

  // Očisti `openSourceCreate` iz URL-a nakon što je pročitan — autoOpenNew prop
  // je već proslijeđen panelu i on drži interni ref-guard.
  useEffect(() => {
    if (!autoOpenNewSource) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('openSourceCreate');
      return next;
    }, { replace: true });
  }, [autoOpenNewSource, setSearchParams]);

  const handleRemoveVoidedAttribution = useCallback(async () => {
    if (!voidedPromptExpenseId || voidedPromptRemoving) return;
    setVoidedPromptRemoving(true);
    try {
      await deleteExpense(voidedPromptExpenseId, { silent: true });
      refetch();
      showSuccess(t('attribution.voidedPrompt.removed', 'Pripis uklonjen'));
    } catch (e) {
      showError(t('attribution.voidedPrompt.removeFailed', 'Uklanjanje nije uspjelo'));
    } finally {
      setVoidedPromptRemoving(false);
      setVoidedPromptExpenseId(null);
    }
  }, [voidedPromptExpenseId, voidedPromptRemoving, deleteExpense, refetch, t]);



  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-6"
      >
        <PageHeader
          title={t('nav.wallet', 'Novčanik')}
          onDataImported={refetch}
        />
        <CustomPaymentSourcesPanel
          onRefetchExpenses={refetch}
          autoOpenNew={autoOpenNewSource}
          onSourceClick={(source) => {
            setSelectedPaymentSource(source);
            setPaymentSourceDialogOpen(true);
            refetch();
          }}
        />
        <WalletTransfersCard
          monthlyTransfers={monthlyTransfers}
          monthlyTransferCount={monthlyTransferCount}
          onClick={() => setTransferDialogOpen(true)}
        />
        <InstallmentsPanel />
        <SavingsGoalsSection />
        <Collapsible className="group">
          <div className="glass-card rounded-2xl animate-fade-in p-4">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between hover:opacity-80 transition-opacity">
                <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-module-muted">
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-module-muted" />
                  {t('dashboard.cashflow.title')}
                </h3>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3">
                <CashflowForecast />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
        <CustomCategoriesPanel />
        <OpenBankingPanel />
        <BankConnection onImportCSV={importFromCSV} findDuplicates={findDuplicates} existingExpenses={allExpenses} />
        <BackupRestore onDataImported={refetch} />
      </motion.div>

      <PaymentSourceTransactionsDialog
        open={paymentSourceDialogOpen}
        onOpenChange={setPaymentSourceDialogOpen}
        paymentSource={selectedPaymentSource}
        expenses={rawExpenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        onBulkDelete={bulkDeleteWithoutUndo}
        onImportCSV={importFromCSVWithRefetch}
        findDuplicates={findDuplicates}
        onPdfProcessingChange={setPaymentSourcePdfProcessing}
      />

      <TransferListDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        transfers={allTransfers}
        totalAmount={totalTransfers}
      />

      <AlertDialog
        open={!!voidedPromptExpenseId}
        onOpenChange={(o) => { if (!o) setVoidedPromptExpenseId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('attribution.voidedPrompt.title', 'Isplata je poništena')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'attribution.voidedPrompt.description',
                'Poslodavac je poništio isplatu koju ste pripisali izvoru. Želite li ukloniti pripisan unos iz novčanika?',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidedPromptRemoving}>
              {t('attribution.voidedPrompt.keep', 'Zadrži')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={voidedPromptRemoving}
              onClick={handleRemoveVoidedAttribution}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('attribution.voidedPrompt.remove', 'Ukloni pripis')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
};

export default Wallet;
