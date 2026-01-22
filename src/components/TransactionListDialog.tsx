import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Expense, getCategoryInfo, getPaymentSourceInfo } from '@/types/expense';
import { EditTransactionDialog } from './EditTransactionDialog';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from './TransactionFilters';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface TransactionListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'income' | 'expense';
  expenses: Expense[];
  onUpdate: (expense: Expense) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  total: number;
}

export const TransactionListDialog = ({
  open,
  onOpenChange,
  type,
  expenses,
  onUpdate,
  onDelete,
  total
}: TransactionListDialogProps) => {
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const { customPaymentSources } = useCustomPaymentSources();

  // Get all cards from all custom payment sources
  const allCards = useMemo(() => {
    return customPaymentSources.flatMap(source => source.cards || []);
  }, [customPaymentSources]);

  const typeFilteredExpenses = useMemo(() => {
    return expenses.filter(e => e.type === type);
  }, [expenses, type]);

  const filteredExpenses = useMemo(() => {
    return applyFilters(typeFilteredExpenses, filters);
  }, [typeFilteredExpenses, filters]);

  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

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

  // Reset filters when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFilters(defaultFilters);
    }
    onOpenChange(open);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {type === 'income' ? (
                <>
                  <TrendingUp className="w-5 h-5 text-income" />
                  <span>Prihodi</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-5 h-5 text-expense" />
                  <span>Troškovi</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <TransactionFilters
            filters={filters}
            onFiltersChange={setFilters}
            showCardFilter={allCards.length > 0}
            cards={allCards}
            className="shrink-0"
          />

          {/* Summary */}
          <div className={cn(
            "p-4 rounded-xl shrink-0",
            type === 'income' ? "bg-income/10" : "bg-expense/10"
          )}>
            <p className="text-sm text-muted-foreground mb-1">
              Prikazano ({filteredExpenses.length} od {typeFilteredExpenses.length})
            </p>
            <p className={cn(
              "text-2xl font-bold font-mono",
              type === 'income' ? "text-income" : "text-expense"
            )}>
              {type === 'expense' ? '-' : ''}{formatAmount(filteredTotal)}
            </p>
          </div>

          {/* Transaction List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mx-6 px-6">
            {filteredExpenses.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">
                  {typeFilteredExpenses.length === 0 
                    ? (type === 'income' ? 'Nema prihoda' : 'Nema troškova')
                    : 'Nema rezultata za odabrane filtere'}
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
                          <span>{categoryInfo.name}</span>
                          <span>•</span>
                          <span>{paymentInfo.icon} {paymentInfo.name}</span>
                        </div>
                      </div>

                      {/* Amount */}
                      <p className={cn(
                        "font-mono font-semibold whitespace-nowrap",
                        type === 'income' ? "text-income" : "text-expense"
                      )}>
                        {type === 'expense' ? '-' : '+'}{formatAmount(expense.amount)}
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
