import { useState } from 'react';
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
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useCallback } from 'react';
import { useBackButton } from '@/hooks/useBackButton';
import { showSuccess } from '@/hooks/useStatusFeedback';

const Wallet = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const { importFromCSV, findDuplicates, refetch, isLocalMode, allExpenses, rawExpenses, updateExpense, deleteExpense } = useExpenses();
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<CustomPaymentSource | null>(null);
  const [paymentSourceDialogOpen, setPaymentSourceDialogOpen] = useState(false);
  const [paymentSourcePdfProcessing, setPaymentSourcePdfProcessing] = useState(false);

  useBackButton(paymentSourceDialogOpen, () => {
    if (paymentSourcePdfProcessing) return;
    setPaymentSourceDialogOpen(false);
  });

  // Wrap importFromCSV so wallet list (balances, transactions) refetches after a successful import.
  const importFromCSVWithRefetch = useCallback(async (txs: Parameters<typeof importFromCSV>[0]) => {
    await importFromCSV(txs);
    refetch();
  }, [importFromCSV, refetch]);

  const bulkDeleteWithoutUndo = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteExpense(id, { silent: true })));
    refetch();
    showSuccess(t('transactions.bulkDeleted', { count: ids.length }));
  }, [deleteExpense, refetch, t]);

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

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
        <CustomPaymentSourcesPanel onRefetchExpenses={refetch} onSourceClick={(source) => {
          setSelectedPaymentSource(source);
          setPaymentSourceDialogOpen(true);
          refetch();
        }} />
        <InstallmentsPanel />
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

      <BottomNav />
    </div>
  );
};

export default Wallet;
