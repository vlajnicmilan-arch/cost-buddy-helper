import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar, CreditCard, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getDateRange, toInputDate, clampInputDate, getDateValidationKey } from '@/lib/dateValidation';
import { showError } from '@/hooks/useStatusFeedback';

interface InstallmentToggleProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  installmentCount: number;
  onInstallmentCountChange: (count: number) => void;
  firstPaymentDate: string;
  onFirstPaymentDateChange: (date: string) => void;
  totalAmount: number;
}

export const InstallmentToggle = ({
  enabled,
  onEnabledChange,
  installmentCount,
  onInstallmentCountChange,
  firstPaymentDate,
  onFirstPaymentDateChange,
  totalAmount
}: InstallmentToggleProps) => {
  const { t } = useTranslation();
  const [monthlyAmount, setMonthlyAmount] = useState(0);

  useEffect(() => {
    if (totalAmount > 0 && installmentCount > 0) {
      const baseAmount = Math.floor((totalAmount / installmentCount) * 100) / 100;
      setMonthlyAmount(baseAmount);
    } else {
      setMonthlyAmount(0);
    }
  }, [totalAmount, installmentCount]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 border border-border/50">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <Label htmlFor="installment-toggle" className="text-sm font-medium cursor-pointer">
            {t('installments.payInInstallments', 'Plaćanje na rate')}
          </Label>
        </div>
        <Switch
          id="installment-toggle"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3 overflow-hidden"
          >
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="installment-count" className="text-xs text-muted-foreground flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    {t('installments.numberOfInstallments', 'Broj rata')}
                  </Label>
                  <Input
                    id="installment-count"
                    type="number"
                    min={2}
                    max={60}
                    value={installmentCount}
                    onChange={(e) => onInstallmentCountChange(Math.max(2, parseInt(e.target.value) || 2))}
                    className="h-9 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="first-payment-date" className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t('installments.firstPaymentDate', 'Prva rata')}
                  </Label>
                  {(() => {
                    const r = getDateRange('recurring');
                    return (
                      <Input
                        id="first-payment-date"
                        type="date"
                        value={firstPaymentDate}
                        min={toInputDate(r.min)}
                        max={toInputDate(r.max)}
                        onChange={(e) => onFirstPaymentDateChange(e.target.value)}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const errKey = getDateValidationKey(v, r);
                          if (errKey) {
                            onFirstPaymentDateChange(clampInputDate(v, r));
                            showError(t(errKey));
                          }
                        }}
                        className="h-9 rounded-lg"
                      />
                    );
                  })()}
                </div>
              </div>
              
              {totalAmount > 0 && installmentCount > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                  <span className="text-sm text-muted-foreground">
                    {t('installments.monthlyPayment', 'Mjesečna rata')}:
                  </span>
                  <span className="font-semibold text-primary">
                    €{monthlyAmount.toFixed(2)} × {installmentCount}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
