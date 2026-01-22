import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IncomeSource } from '@/types/incomeSource';
import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from '@/components/TransactionFilters';
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
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // All transactions linked to this source (both income and expenses)
  const allTransactions = useMemo(() => {
    if (!source) return [];
    return expenses.filter(e => e.income_source_id === source.id);
  }, [expenses, source]);

  // Apply filters
  const filteredTransactions = useMemo(() => {
    return applyFilters(allTransactions, filters);
  }, [allTransactions, filters]);

  // Separate income and expenses for the source (from filtered)
  const incomeTransactions = useMemo(() => 
    filteredTransactions.filter(e => e.type === 'income'), [filteredTransactions]);
  
  const expenseTransactions = useMemo(() => 
    filteredTransactions.filter(e => e.type === 'expense'), [filteredTransactions]);

  const totalIncome = useMemo(() => 
    incomeTransactions.reduce((sum, e) => sum + e.amount, 0), [incomeTransactions]);
  
  const totalExpenses = useMemo(() => 
    expenseTransactions.reduce((sum, e) => sum + e.amount, 0), [expenseTransactions]);

  const balance = totalIncome - totalExpenses;

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  // Reset filters when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFilters(defaultFilters);
    }
    onOpenChange(open);
  };

  if (!source) return null;

  const sourceColor = source.color || '#22c55e';
  const sourceIcon = source.icon || '💰';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{ backgroundColor: `${sourceColor}20` }}
            >
              {sourceIcon}
            </div>
            <div>
              <span>{source.name}</span>
              {source.description && (
                <p className="text-sm text-muted-foreground font-normal">{source.description}</p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <TransactionFilters
          filters={filters}
          onFiltersChange={setFilters}
          className="shrink-0"
        />

        {/* Summary */}
        <div 
          className="p-4 rounded-xl space-y-2 shrink-0"
          style={{ backgroundColor: `${sourceColor}15` }}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Prihodi ({incomeTransactions.length})</span>
            <span className="font-mono font-semibold text-income">+{formatAmount(totalIncome)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Troškovi ({expenseTransactions.length})</span>
            <span className="font-mono font-semibold text-expense">-{formatAmount(totalExpenses)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between items-center">
            <span className="text-sm font-medium">Stanje</span>
            <span className={`text-lg font-bold font-mono ${balance >= 0 ? 'text-income' : 'text-expense'}`}>
              {formatAmount(balance)}
            </span>
          </div>
          {filteredTransactions.length !== allTransactions.length && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              Prikazano {filteredTransactions.length} od {allTransactions.length} transakcija
            </p>
          )}
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mx-6 px-6">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center">
              <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {allTransactions.length === 0 
                  ? 'Nema transakcija za ovaj izvor'
                  : 'Nema rezultata za odabrane filtere'}
              </p>
              {allTransactions.length === 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Dodaj prihod ili trošak i poveži ga s ovim izvorom
                </p>
              )}
            </div>
          ) : (
            <AnimatePresence>
              {filteredTransactions.map((expense) => {
                const categoryInfo = getCategoryInfo(expense.category);
                const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
                const isIncome = expense.type === 'income';
                
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
                        <span>•</span>
                        <span className={isIncome ? 'text-income' : 'text-expense'}>
                          {isIncome ? 'Prihod' : 'Trošak'}
                        </span>
                      </div>
                    </div>

                    {/* Amount */}
                    <p className={`font-mono font-semibold whitespace-nowrap ${isIncome ? 'text-income' : 'text-expense'}`}>
                      {isIncome ? '+' : '-'}{formatAmount(expense.amount)}
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
