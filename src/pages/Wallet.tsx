import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { CustomPaymentSourcesPanel } from '@/components/custom-payment-sources/CustomPaymentSourcesPanel';
import { CustomCategoriesPanel } from '@/components/custom-categories/CustomCategoriesPanel';
import { BankConnection } from '@/components/BankConnection';
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

const Wallet = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const { importFromCSV, findDuplicates, refetch, isLocalMode, allExpenses, updateExpense, deleteExpense } = useExpenses();
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<CustomPaymentSource | null>(null);
  const [paymentSourceDialogOpen, setPaymentSourceDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
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
        <CustomPaymentSourcesPanel onSourceClick={(source) => {
          setSelectedPaymentSource(source);
          setPaymentSourceDialogOpen(true);
        }} />
        <InstallmentsPanel />
        <CustomCategoriesPanel />
        <BankConnection onImportCSV={importFromCSV} findDuplicates={findDuplicates} />
        <BackupRestore onDataImported={refetch} />
      </motion.div>

      <PaymentSourceTransactionsDialog
        open={paymentSourceDialogOpen}
        onOpenChange={setPaymentSourceDialogOpen}
        paymentSource={selectedPaymentSource}
        expenses={allExpenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
      />

      <BottomNav />
    </div>
  );
};

export default Wallet;
