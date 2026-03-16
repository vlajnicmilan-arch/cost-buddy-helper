import { useTranslation } from 'react-i18next';
import { CustomPaymentSourcesPanel } from '@/components/custom-payment-sources/CustomPaymentSourcesPanel';
import { Wallet } from 'lucide-react';

export const BusinessWallet = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">{t('business.nav.wallet', 'Novčanik')}</h2>
      </div>

      <CustomPaymentSourcesPanel hideHeader={false} />
    </div>
  );
};
