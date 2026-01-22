import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Expense, getCategoryInfo } from '@/types/expense';
import { EditTransactionDialog } from './EditTransactionDialog';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp, TrendingDown, ArrowLeftRight, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface PaymentSourceTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentSource: CustomPaymentSource | null;
  expenses: Expense[];
  onUpdate: (expense: Expense) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const PaymentSourceTransactionsDialog = ({
  open,
  onOpenChange,
  paymentSource,
  expenses,
  onUpdate,
  onDelete
}: PaymentSourceTransactionsDialogProps) => {
  const { t } = useTranslation();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Filter expenses for this payment source
  const sourceExpenses = useMemo(() => {
    if (!paymentSource) return [];
    
    return expenses.filter(e => {
      // Match by custom payment source ID in payment_source field
      if (e.payment_source?.startsWith(`custom:${paymentSource.id}`)) {
        return true;
      }
      // Match by payment_source_card_id if it belongs to this source
      if (e.payment_source_card_id && paymentSource.cards) {
        return paymentSource.cards.some(card => card.id === e.payment_source_card_id);
      }
      return false;
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [expenses, paymentSource]);

  // Calculate totals
  const { totalIncome, totalExpenses, totalTransfers } = useMemo(() => {
    return sourceExpenses.reduce((acc, e) => {
      if (e.type === 'income') acc.totalIncome += e.amount;
      else if (e.type === 'expense') acc.totalExpenses += e.amount;
      else if (e.type === 'transfer') acc.totalTransfers += e.amount;
      return acc;
    }, { totalIncome: 0, totalExpenses: 0, totalTransfers: 0 });
  }, [sourceExpenses]);

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setEditDialogOpen(true);
  };

  const handleSave = async (expense: Expense) => {
    await onUpdate(expense);
    setEditDialogOpen(false);
    setEditingExpense(null);
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
  };

  const getCardInfo = (expense: Expense) => {
    if (!expense.payment_source_card_id || !paymentSource?.cards) return null;
    return paymentSource.cards.find(c => c.id === expense.payment_source_card_id);
  };

  if (!paymentSource) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <span 
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                style={{ backgroundColor: paymentSource.color + '20', color: paymentSource.color }}
              >
                {paymentSource.icon}
              </span>
              <div>
                <span className="block">{paymentSource.name}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {sourceExpenses.length} {t('transactions.transactions')}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Balance & Summary */}
          <div className="grid grid-cols-2 gap-3 shrink-0">
            <div className="p-3 rounded-xl bg-primary/10 col-span-2">
              <p className="text-xs text-muted-foreground mb-1">{t('summary.balance')}</p>
              <p className={cn(
                "text-2xl font-bold font-mono",
                paymentSource.balance >= 0 ? "text-primary" : "text-destructive"
              )}>
                {formatAmount(paymentSource.balance)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3 h-3 text-primary" />
                <p className="text-xs text-muted-foreground">{t('summary.totalIncome')}</p>
              </div>
              <p className="text-sm font-semibold text-primary font-mono">
                +{formatAmount(totalIncome)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-3 h-3 text-destructive" />
                <p className="text-xs text-muted-foreground">{t('summary.totalExpenses')}</p>
              </div>
              <p className="text-sm font-semibold text-destructive font-mono">
                -{formatAmount(totalExpenses)}
              </p>
            </div>
          </div>

          {/* Cards list if any */}
          {paymentSource.cards && paymentSource.cards.length > 0 && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {paymentSource.cards.map(card => (
                <div 
                  key={card.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 text-xs"
                >
                  <CreditCard className="w-3 h-3" />
                  <span>{card.card_name}</span>
                  <span className="text-muted-foreground">****{card.last_four_digits}</span>
                </div>
              ))}
            </div>
          )}

          {/* Transaction List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mx-6 px-6">
            {sourceExpenses.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">{t('transactions.noTransactions')}</p>
              </div>
            ) : (
              <AnimatePresence>
                {sourceExpenses.map((expense) => {
                  const categoryInfo = getCategoryInfo(expense.category);
                  const cardInfo = getCardInfo(expense);
                  
                  return (
                    <motion.div
                      key={expense.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted/80 transition-colors group"
                    >
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg">
                        {expense.type === 'transfer' ? (
                          <ArrowLeftRight className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          categoryInfo.icon
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{expense.description}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{format(expense.date, 'dd.MM.yyyy', { locale: hr })}</span>
                          {cardInfo && (
                            <>
                              <span>•</span>
                              <span>****{cardInfo.last_four_digits}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <p className={cn(
                        "font-mono font-semibold whitespace-nowrap",
                        expense.type === 'income' ? "text-primary" : 
                        expense.type === 'expense' ? "text-destructive" : 
                        "text-muted-foreground"
                      )}>
                        {expense.type === 'expense' ? '-' : expense.type === 'income' ? '+' : ''}
                        {formatAmount(expense.amount)}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(expense)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(expense.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EditTransactionDialog
        expense={editingExpense}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSave}
      />
    </>
  );
};
