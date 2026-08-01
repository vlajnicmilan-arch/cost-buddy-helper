import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomPaymentSourcesPanel } from '@/components/custom-payment-sources/CustomPaymentSourcesPanel';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useExpenses } from '@/hooks/useExpenses';
import { PaymentSourceTransactionsDialog } from '@/components/PaymentSourceTransactionsDialog';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { Wallet, Info, Landmark } from 'lucide-react';
import { SyncAllBankAccountsButton } from '@/components/wallet/SyncAllBankAccountsButton';
import { OpenBankingPanel } from '@/components/OpenBankingPanel';
import { BankConnection } from '@/components/BankConnection';
import { useAppState } from '@/contexts/AppStateContext';

export const BusinessWallet = () => {
  const { t } = useTranslation();
  const { customPaymentSources, loading } = useCustomPaymentSources();
  const { rawExpenses, allExpenses, updateExpense, deleteExpense, importFromCSV, findDuplicates, refetch } = useExpenses();
  const { activeBusinessProfileId } = useAppState();
  const hasNoSources = !loading && customPaymentSources.length === 0;

  const [selectedSource, setSelectedSource] = useState<CustomPaymentSource | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Isti obrazac kao u BusinessTransactions: uvoz se vezuje na izvor aktivne tvrtke.
  const businessSources = useMemo(
    () => customPaymentSources.filter(s => s.business_profile_id === activeBusinessProfileId),
    [customPaymentSources, activeBusinessProfileId]
  );

  const defaultBusinessPaymentSourceId = useMemo(() => {
    if (!activeBusinessProfileId || businessSources.length === 0) return undefined;
    const stored = localStorage.getItem(`bankImportSource:${activeBusinessProfileId}`);
    if (stored && businessSources.some(s => s.id === stored)) return stored;
    return businessSources[0].id;
  }, [activeBusinessProfileId, businessSources]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Wallet className="w-5 h-5 text-primary shrink-0" />
          <h2 className="text-lg font-bold truncate">{t('business.nav.wallet', 'Novčanik')}</h2>
        </div>
        <SyncAllBankAccountsButton />
      </div>

      {hasNoSources && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {t('business.wallet.emptyTitle', 'Dodajte prvi poslovni račun')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('business.wallet.emptyHint', 'Npr. Žiroračun tvrtke, Blagajna, Devizni račun. Bez izvora plaćanja saldo se ne ažurira automatski.')}
            </p>
          </div>
        </div>
      )}

      <CustomPaymentSourcesPanel
        hideHeader={false}
        onRefetchExpenses={refetch}
        onSourceClick={(source) => {
          setSelectedSource(source);
          setDialogOpen(true);
          refetch();
        }}
      />

      <div className="space-y-4 pt-2 border-t border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <Landmark className="w-5 h-5 text-primary shrink-0" />
          <h3 className="text-base font-semibold truncate">
            {t('business.wallet.bankingTitle', 'Banka i uvoz izvoda')}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          {t('business.wallet.bankingHint', 'Povežite poslovni račun putem Open Bankinga ili uvezite izvod.')}
        </p>

        <OpenBankingPanel />

        <BankConnection
          onImportCSV={importFromCSV}
          findDuplicates={findDuplicates}
          existingExpenses={allExpenses}
          defaultBusinessPaymentSourceId={defaultBusinessPaymentSourceId}
        />
      </div>

      <PaymentSourceTransactionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        paymentSource={selectedSource}
        expenses={rawExpenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        onImportCSV={importFromCSV}
        findDuplicates={findDuplicates}
      />
    </div>
  );
};
