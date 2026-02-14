import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Expense, getPaymentSourceInfo, PAYMENT_SOURCES } from '@/types/expense';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from './TransactionFilters';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { ArrowRight, ArrowLeftRight, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface TransferListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfers: Expense[];
  totalAmount: number;
}

// Helper to detect source and destination from description
function parseTransferDetails(description: string, paymentSource?: string): {
  from: { name: string; icon: string };
  to: { name: string; icon: string };
} {
  const desc = description.toLowerCase();
  
  // Default values
  let fromSource = paymentSource || 'other';
  let toSource = 'other';
  
  // Detect patterns like "Uplata na Aircash - Visa *** 7262"
  if (desc.includes('uplata na aircash') || desc.includes('aircash nadoplata') || desc.includes('aircash top up')) {
    toSource = 'aircash';
    if (desc.includes('visa') || desc.includes('mastercard') || desc.includes('maestro')) {
      fromSource = 'bank';
    } else if (desc.includes('gotovina') || desc.includes('tisak')) {
      fromSource = 'cash';
    }
  }
  
  // Revolut top-ups
  if (desc.includes('revolut top') || desc.includes('to revolut') || desc.includes('revolut nadoplata')) {
    toSource = 'revolut';
    if (desc.includes('visa') || desc.includes('mastercard') || desc.includes('bank')) {
      fromSource = 'bank';
    }
  }
  
  // From Revolut to bank
  if (desc.includes('from revolut') || desc.includes('revolut withdrawal')) {
    fromSource = 'revolut';
    toSource = 'bank';
  }
  
  // ATM withdrawals
  if (desc.includes('bankomat') || desc.includes('atm') || desc.includes('podizanje gotovine')) {
    fromSource = 'bank';
    toSource = 'cash';
  }
  
  // Cash deposits
  if (desc.includes('polog gotovine') || desc.includes('cash deposit') || desc.includes('uplata gotovine')) {
    fromSource = 'cash';
    toSource = desc.includes('aircash') ? 'aircash' : 'bank';
  }
  
  // Crypto transfers
  if (desc.includes('crypto') || desc.includes('bitcoin') || desc.includes('ethereum')) {
    if (desc.includes('buy') || desc.includes('kupovina')) {
      fromSource = 'bank';
      toSource = 'crypto';
    } else if (desc.includes('sell') || desc.includes('prodaja')) {
      fromSource = 'crypto';
      toSource = 'bank';
    }
  }
  
  // Exchange operations
  if (desc.includes('exchange') || desc.includes('mjenjačnica') || desc.includes('konverzija')) {
    toSource = fromSource;
  }
  
  // Bank to bank transfers
  if (desc.includes('prijenos') && !toSource) {
    toSource = 'bank';
  }
  
  const fromInfo = PAYMENT_SOURCES.find(s => s.id === fromSource) || PAYMENT_SOURCES[5];
  const toInfo = PAYMENT_SOURCES.find(s => s.id === toSource) || PAYMENT_SOURCES[5];
  
  return {
    from: { name: fromInfo.name, icon: fromInfo.icon },
    to: { name: toInfo.name, icon: toInfo.icon }
  };
}

export const TransferListDialog = ({
  open,
  onOpenChange,
  transfers,
  totalAmount
}: TransferListDialogProps) => {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const { formatAmount } = useCurrency();

  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  // Apply filters
  const filteredTransfers = useMemo(() => {
    return applyFilters(transfers, filters);
  }, [transfers, filters]);

  const filteredTotal = useMemo(() => 
    filteredTransfers.reduce((sum, t) => sum + Number(t.amount), 0),
    [filteredTransfers]
  );


  // Group transfers by month
  const groupedTransfers = filteredTransfers.reduce((acc, transfer) => {
    const monthKey = format(transfer.date, 'yyyy-MM');
    const monthLabel = format(transfer.date, 'LLLL yyyy', { locale: dateLocale });
    
    if (!acc[monthKey]) {
      acc[monthKey] = { label: monthLabel, items: [], total: 0 };
    }
    acc[monthKey].items.push(transfer);
    acc[monthKey].total += Number(transfer.amount);
    
    return acc;
  }, {} as Record<string, { label: string; items: Expense[]; total: number }>);

  const sortedMonths = Object.keys(groupedTransfers).sort((a, b) => b.localeCompare(a));

  // Reset filters when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFilters(defaultFilters);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            {t('transactions.transfersBetweenAccounts')}
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <TransactionFilters
          filters={filters}
          onFiltersChange={setFilters}
          className="shrink-0"
        />

        {/* Summary */}
        <div className="p-4 rounded-xl bg-primary/10 text-center shrink-0">
          <p className="text-sm text-muted-foreground mb-1">
            {t('transactions.shown')} ({filteredTransfers.length} {t('transactions.of')} {transfers.length})
          </p>
          <p className="text-2xl font-bold font-mono text-primary">
            ↔ {formatAmount(filteredTotal)}
          </p>
        </div>

        {/* Transfer List */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6" style={{ maxHeight: 'calc(85vh - 280px)' }}>
          {filteredTransfers.length === 0 ? (
            <div className="py-12 text-center">
              <ArrowLeftRight className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {transfers.length === 0 
                  ? t('transactions.noTransfers')
                  : t('transactions.noResults')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('transactions.noTransfersHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {sortedMonths.map((monthKey) => {
                const group = groupedTransfers[monthKey];
                return (
                  <div key={monthKey}>
                    {/* Month Header */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground capitalize">
                        {group.label}
                      </h3>
                      <span className="text-xs font-mono text-muted-foreground">
                        ↔ {formatAmount(group.total)}
                      </span>
                    </div>

                    {/* Transfers in Month */}
                    <div className="space-y-2">
                      {group.items.map((transfer) => {
                        const details = parseTransferDetails(
                          transfer.description,
                          transfer.payment_source
                        );

                        return (
                          <div
                            key={transfer.id}
                            className="p-4 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                          >
                            {/* Transfer Flow */}
                            <div className="flex items-center justify-center gap-3 mb-3">
                              <div className="flex flex-col items-center">
                                <span className="text-2xl">{details.from.icon}</span>
                                <span className="text-xs text-muted-foreground mt-1">
                                  {details.from.name}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1 px-3">
                                <div className="h-px w-8 bg-border" />
                                <ArrowRight className="w-4 h-4 text-primary" />
                                <div className="h-px w-8 bg-border" />
                              </div>
                              
                              <div className="flex flex-col items-center">
                                <span className="text-2xl">{details.to.icon}</span>
                                <span className="text-xs text-muted-foreground mt-1">
                                  {details.to.name}
                                </span>
                              </div>
                            </div>

                            {/* Amount */}
                            <div className="text-center mb-2">
                              <span className="text-lg font-bold font-mono text-primary">
                                {formatAmount(Number(transfer.amount))}
                              </span>
                            </div>

                            {/* Date and Description */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {format(transfer.date, 'dd.MM.yyyy.', { locale: dateLocale })}
                                </span>
                              </div>
                            </div>

                            {/* Description if exists */}
                            {transfer.description && (
                              <p className="mt-2 text-sm text-muted-foreground truncate">
                                {transfer.description}
                              </p>
                            )}

                            {/* Merchant if exists */}
                            {transfer.merchant_name && (
                              <p className="mt-1 text-xs text-muted-foreground/70">
                                📍 {transfer.merchant_name}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
