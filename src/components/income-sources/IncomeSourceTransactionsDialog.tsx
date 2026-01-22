import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IncomeSource } from '@/types/incomeSource';
import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface IncomeSourceTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: IncomeSource | null;
  expenses: Expense[];
  onEditTransaction: (expense: Expense) => void;
  onDeleteTransaction: (id: string) => Promise<void>;
}

export const IncomeSourceTransactionsDialog = ({
  open,
  onOpenChange,
  source,
  expenses,
  onEditTransaction,
  onDeleteTransaction
}: IncomeSourceTransactionsDialogProps) => {
  const filteredExpenses = useMemo(() => {
    if (!source) return [];
    return expenses.filter(e => 
      e.type === 'income' && e.income_source_id === source.id
    );
  }, [expenses, source]);

  const totalAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{ backgroundColor: `${source.color}20` }}
            >
              {source.icon}
            </div>
            <div>
              <span>{source.name}</span>
              {source.description && (
                <p className="text-sm text-muted-foreground font-normal">{source.description}</p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div 
          className="p-4 rounded-xl mb-4"
          style={{ backgroundColor: `${source.color}15` }}
        >
          <p className="text-sm text-muted-foreground mb-1">
            Ukupno ({filteredExpenses.length} transakcija)
          </p>
          <p className="text-2xl font-bold font-mono text-income">
            {formatAmount(totalAmount)}
          </p>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {filteredExpenses.length === 0 ? (
            <div className="py-12 text-center">
              <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nema prihoda za ovaj izvor</p>
              <p className="text-sm text-muted-foreground mt-1">
                Dodaj novi prihod i poveži ga s ovim izvorom
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredExpenses.map((expense) => {
                const categoryInfo = getCategoryInfo(expense.category);
                const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
                
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
                      {categoryInfo.icon}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{expense.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(expense.date, 'dd.MM.yyyy', { locale: hr })}</span>
                        <span>•</span>
                        <span>{paymentInfo.icon} {paymentInfo.name}</span>
                      </div>
                    </div>

                    {/* Amount */}
                    <p className="font-mono font-semibold whitespace-nowrap text-income">
                      +{formatAmount(expense.amount)}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEditTransaction(expense)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDeleteTransaction(expense.id)}
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
  );
};
