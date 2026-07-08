import { useBackButton } from '@/hooks/useBackButton';
import { Button } from '@/components/ui/button';
import { X, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CustomPaymentSourcesPanel } from './CustomPaymentSourcesPanel';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PaymentSourcesFullScreenViewProps {
  open: boolean;
  onClose: () => void;
}

export const PaymentSourcesFullScreenView = ({ open, onClose }: PaymentSourcesFullScreenViewProps) => {
  const { t } = useTranslation();
  useBackButton(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-module" />
              <h1 className="text-lg font-semibold text-module">
                {t('paymentSources.myAccounts', 'Prilagođeni izvori plaćanja')}
              </h1>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-4 max-w-2xl mx-auto w-full">
              <CustomPaymentSourcesPanel hideHeader />
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
