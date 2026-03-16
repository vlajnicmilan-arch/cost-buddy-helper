import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { CustomPaymentSourcesPanel } from '@/components/custom-payment-sources/CustomPaymentSourcesPanel';
import { PaymentSourcesFullScreenView } from '@/components/custom-payment-sources/PaymentSourcesFullScreenView';
import { PaymentSourcesSection } from '@/components/home/PaymentSourcesSection';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { Wallet } from 'lucide-react';

export const BusinessWallet = () => {
  const { t } = useTranslation();
  const { customPaymentSources } = useCustomPaymentSources();
  const [selectedSource, setSelectedSource] = useState<CustomPaymentSource | null>(null);

  const handleSourceClick = (source: CustomPaymentSource) => {
    setSelectedSource(source);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">{t('business.nav.wallet', 'Novčanik')}</h2>
      </div>

      {/* Payment sources summary */}
      {customPaymentSources.length > 0 && (
        <PaymentSourcesSection
          customPaymentSources={customPaymentSources}
          onSourceClick={handleSourceClick}
        />
      )}

      {/* Full CRUD panel */}
      <CustomPaymentSourcesPanel
        hideHeader={false}
        onSourceClick={handleSourceClick}
      />

      {/* Full screen transaction view for selected source */}
      {selectedSource && (
        <PaymentSourcesFullScreenView
          source={selectedSource}
          open={!!selectedSource}
          onOpenChange={(open) => { if (!open) setSelectedSource(null); }}
        />
      )}
    </div>
  );
};
