import { useState, useMemo, forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense, CategoryInfo, getCategoryInfo, getPaymentSourceInfo, CATEGORIES, Category } from '@/types/expense';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from './TransactionFilters';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, Tag, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface CategoryTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryInfo | null;
  expenses: Expense[];
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  onEditTransaction: (expense: Expense) => void;
}

export const CategoryTransactionsDialog = forwardRef<HTMLDivElement, CategoryTransactionsDialogProps>(({
  open,
  onOpenChange,
  category,
  expenses,
  onUpdateExpense,
  onDeleteExpense,
  onEditTransaction
}, ref) => {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [changingCategoryId, setChangingCategoryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // All expenses in this category
  const categoryExpenses = useMemo(() => {
    if (!category) return [];
    return expenses
      .filter(e => e.type === 'expense' && e.category === category.id)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [expenses, category]);

  // Apply filters
  const filteredExpenses = useMemo(() => {
    return applyFilters(categoryExpenses, filters);
  }, [categoryExpenses, filters]);

  const totalAmount = useMemo(() => 
    filteredExpenses.reduce((sum, e) => sum + e.amount, 0), 
    [filteredExpenses]
  );

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  // Selection handlers
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk operations
  const handleBulkCategoryChange = async (newCategory: Category) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onUpdateExpense({ ...expense, category: newCategory });
        successCount++;
      } catch (error) {
        console.error('Error updating expense:', error);
      }
    }
    
    const catInfo = getCategoryInfo(newCategory);
    toast.success(`Kategorija "${catInfo.name}" postavljena za ${successCount} transakcija`);
    clearSelection();
  };

  const handleBulkPaymentSourceChange = async (paymentSource: string) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onUpdateExpense({ 
          ...expense, 
          payment_source: paymentSource as any, // Custom sources use custom:id format
          payment_source_card_id: null
        });
        successCount++;
      } catch (error) {
        console.error('Error updating expense:', error);
      }
    }
    
    toast.success(`Izvor plaćanja promijenjen za ${successCount} transakcija`);
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const selectedExpenses = filteredExpenses.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onDeleteExpense(expense.id);
        successCount++;
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    }
    
    toast.success(`Obrisano ${successCount} transakcija`);
    clearSelection();
  };

  const handleCategoryChange = async (expense: Expense, newCategory: Category) => {
    try {
      await onUpdateExpense({
        ...expense,
        category: newCategory
      });
      const newCatInfo = getCategoryInfo(newCategory);
      toast.success(`Kategorija promijenjena u "${newCatInfo.name}"`);
      setChangingCategoryId(null);
    } catch (error) {
      toast.error('Greška pri promjeni kategorije');
    }
  };

  // Reset filters when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFilters(defaultFilters);
      setChangingCategoryId(null);
      clearSelection();
    }
    onOpenChange(open);
  };

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <DialogTitle className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                  style={{ backgroundColor: `hsl(var(--${category.color}) / 0.2)` }}
                >
                  {category.icon}
                </div>
                <div>
                  <span>{category.name}</span>
                  <p className="text-sm text-muted-foreground font-normal">
                    Troškovi u ovoj kategoriji
                  </p>
                </div>
              </DialogTitle>
              {selectedIds.size > 0 && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">
                  {selectedIds.size} odabrano
                </span>
              )}
            </div>
            {filteredExpenses.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={selectedIds.size === filteredExpenses.length ? clearSelection : selectAll}
                className="h-7 text-xs gap-1.5 shrink-0"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {selectedIds.size === filteredExpenses.length ? 'Poništi' : 'Odaberi sve'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Filters */}
        <TransactionFilters
          filters={filters}
          onFiltersChange={setFilters}
          className="shrink-0"
        />

        {/* Bulk Actions Toolbar */}
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          totalCount={filteredExpenses.length}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onBulkCategoryChange={handleBulkCategoryChange}
          onBulkPaymentSourceChange={handleBulkPaymentSourceChange}
          onBulkDelete={handleBulkDelete}
        />

        {/* Summary */}
        <div 
          className="p-4 rounded-xl shrink-0"
          style={{ backgroundColor: `hsl(var(--${category.color}) / 0.1)` }}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Prikazano {filteredExpenses.length} od {categoryExpenses.length}
            </span>
            <span className="font-mono font-semibold text-expense">
              -{formatAmount(totalAmount)}
            </span>
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mx-6 px-6">
          {filteredExpenses.length === 0 ? (
            <div className="py-12 text-center">
              <Tag className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {categoryExpenses.length === 0 
                  ? 'Nema troškova u ovoj kategoriji'
                  : 'Nema rezultata za odabrane filtere'}
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredExpenses.map((expense) => {
                const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
                const isChangingCategory = changingCategoryId === expense.id;
                const isSelected = selectedIds.has(expense.id);
                
                return (
                  <motion.div
                    key={expense.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className={cn(
                      "p-3 rounded-xl transition-colors",
                      isSelected 
                        ? "bg-primary/10 border border-primary/30" 
                        : "bg-muted/50 hover:bg-muted/80"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(expense.id)}
                        className="shrink-0"
                      />

                      {/* Icon */}
                      <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg">
                        {category.icon}
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
                      <p className="font-mono font-semibold whitespace-nowrap text-expense">
                        -{formatAmount(expense.amount)}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setChangingCategoryId(isChangingCategory ? null : expense.id)}
                          title="Promijeni kategoriju"
                        >
                          <Tag className="w-4 h-4" />
                        </Button>
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
                          onClick={() => onDeleteExpense(expense.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Category Change UI */}
                    {isChangingCategory && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 pt-3 border-t border-border/50"
                      >
                        <p className="text-xs text-muted-foreground mb-2">Promijeni kategoriju:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {CATEGORIES.filter(c => c.id !== category.id).slice(0, 12).map((cat) => (
                            <Button
                              key={cat.id}
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7 text-xs px-2"
                              onClick={() => handleCategoryChange(expense, cat.id)}
                            >
                              <span>{cat.icon}</span>
                              <span>{cat.name}</span>
                            </Button>
                          ))}
                        </div>
                        <Select onValueChange={(value) => handleCategoryChange(expense, value as Category)}>
                          <SelectTrigger className="mt-2 h-8 text-xs">
                            <SelectValue placeholder="Sve kategorije..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {CATEGORIES.filter(c => c.id !== category.id).map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                <span className="flex items-center gap-2">
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

CategoryTransactionsDialog.displayName = 'CategoryTransactionsDialog';
