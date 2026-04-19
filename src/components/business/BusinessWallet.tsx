import { useTranslation } from 'react-i18next';
import { CustomPaymentSourcesPanel } from '@/components/custom-payment-sources/CustomPaymentSourcesPanel';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { Wallet, Info } from 'lucide-react';

export const BusinessWallet = () => {
  const { t } = useTranslation();
  const { customPaymentSources, loading } = useCustomPaymentSources();
  const hasNoSources = !loading && customPaymentSources.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">{t('business.nav.wallet', 'Novčanik')}</h2>
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

      <CustomPaymentSourcesPanel hideHeader={false} />
    </div>
  );
};
