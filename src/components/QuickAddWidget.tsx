import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCategoryHabits } from '@/hooks/useCategoryHabits';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, ArrowDownCircle, ArrowUpCircle, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Expense, Category } from '@/types/expense';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface QuickAddWidgetProps {
  onAdd: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void> | void;
}

export const QuickAddWidget = ({ onAdd }: QuickAddWidgetProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const { getSuggestedCategory } = useCategoryHabits();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => amountRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const amountVal = parseFloat(amount);
    if (!amountVal || amountVal <= 0) return;

    setSubmitting(true);
    try {
      const category = type === 'expense'
        ? (getSuggestedCategory(description.trim()) || 'other')
        : 'other_income';

      await onAdd({
        amount: amountVal,
        description: description.trim() || (type === 'expense' ? t('quickAdd.expense') : t('quickAdd.income')),
        category: category as Category,
        date: new Date(),
        type,
        payment_source: 'cash',
      });

      toast.success(type === 'expense' ? t('quickAdd.expenseAdded') : t('quickAdd.incomeAdded'));
      setAmount('');
      setDescription('');
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && amount) handleSubmit();
    if (e.key === 'Escape') setIsOpen(false);
  };

  return (
    <>
      {/* FAB Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
            aria-label={t('quickAdd.title')}
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Quick Add Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-20 left-3 right-3 z-50 bg-card border border-border rounded-2xl p-4 shadow-xl max-w-md mx-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">{t('quickAdd.title')}</h4>
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Type toggle */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setType('expense')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all",
                    type === 'expense'
                      ? 'bg-expense/15 text-expense border border-expense/30'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  {t('quickAdd.expense')}
                </button>
                <button
                  onClick={() => setType('income')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all",
                    type === 'income'
                      ? 'bg-income/15 text-income border border-income/30'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  {t('quickAdd.income')}
                </button>
              </div>

              {/* Amount + Description */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    ref={amountRef}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`0.00 ${currency.symbol}`}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="text-lg font-mono h-11"
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={!amount || submitting}
                  size="icon"
                  className={cn(
                    "h-11 w-11 shrink-0",
                    type === 'expense' ? 'bg-expense hover:bg-expense/90' : 'bg-income hover:bg-income/90'
                  )}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              <Input
                placeholder={t('quickAdd.descriptionPlaceholder')}
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
                className="mt-2 h-9 text-sm"
              />

              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                {t('quickAdd.hint')}
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
