import { useState, useMemo, forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense, CategoryInfo, getCategoryInfo, getPaymentSourceInfo, CATEGORIES, Category } from '@/types/expense';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from './TransactionFilters';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { Pencil, Trash2, Tag, CheckSquare, ShoppingCart } from 'lucide-react';
import { TransactionItemsExpander } from './TransactionItemsExpander';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [changingCategoryId, setChangingCategoryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedItemsId, setExpandedItemsId] = useState<string | null>(null);
  const { formatAmount } = useCurrency();

  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

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
    
    showSuccess(t('transactions.categoryChanged', { count: successCount }));
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
    
    showSuccess(t('transactions.paymentSourceChanged', { count: successCount }));
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
    
    showSuccess(t('transactions.deleted', { count: successCount }));
    clearSelection();
  };

  const handleCategoryChange = async (expense: Expense, newCategory: Category) => {
    try {
      await onUpdateExpense({
        ...expense,
        category: newCategory
      });
      const newCatInfo = getCategoryInfo(newCategory);
      showSuccess(t('transactions.categoryChangedTo', { name: newCatInfo.name }));
      setChangingCategoryId(null);
    } catch (error) {
      showError(t('transactions.categoryChangeError'));
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
      <DialogContent className="sm:max-w-lg max-h-[100dvh] sm:max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
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
                    {t('transactions.expensesInCategory')}
                  </p>
                </div>
              </DialogTitle>
              {selectedIds.size > 0 && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">
                  {selectedIds.size} {t('common.selected')}
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
                {selectedIds.size === filteredExpenses.length ? t('common.cancelSelection') : t('common.selectAll')}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Filters */}
        <div className="px-6">
          <TransactionFilters
            filters={filters}
            onFiltersChange={setFilters}
            className="shrink-0"
          />
        </div>

        {/* Bulk Actions Toolbar */}
        <div className="px-6">
          <BulkActionsToolbar
            selectedCount={selectedIds.size}
            totalCount={filteredExpenses.length}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkCategoryChange={handleBulkCategoryChange}
            onBulkPaymentSourceChange={handleBulkPaymentSourceChange}
            onBulkDelete={handleBulkDelete}
          />
        </div>

        {/* Summary */}
        <div 
          className="p-4 mx-6 rounded-xl shrink-0"
          style={{ backgroundColor: `hsl(var(--${category.color}) / 0.1)` }}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {t('transactions.shown')} {filteredExpenses.length} {t('transactions.of')} {categoryExpenses.length}
            </span>
            <span className="font-mono font-semibold text-expense">
              -{formatAmount(totalAmount)}
            </span>
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2 px-6 pb-6 pt-2">
            {filteredExpenses.length === 0 ? (
              <div className="py-12 text-center">
                <Tag className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">
                  {categoryExpenses.length === 0 
                    ? t('transactions.noExpensesInCategory')
                    : t('transactions.noResults')}
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
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={cn(
                        "rounded-lg transition-colors",
                        isSelected 
                          ? "bg-primary/10" 
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className="group flex items-center gap-2 py-2.5 px-2">
                        {/* Checkbox */}
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(expense.id)}
                          className="shrink-0"
                        />

                        {/* Category Icon */}
                        <div 
                          className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: `hsl(var(--${category.color}) / 0.15)` }}
                        >
                          {category.icon}
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-medium text-foreground truncate text-sm leading-tight">
                            {expense.merchant_name || expense.description}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight">
                            <span className="truncate">{paymentInfo.icon} {paymentInfo.name}</span>
                          </div>
                        </div>

                        {/* Amount & Date */}
                        <div className="flex flex-col items-end shrink-0 gap-0.5">
                          <p className="font-mono font-bold text-sm leading-tight text-expense">
                            -{formatAmount(expense.amount)}
                          </p>
                          <span className="text-[10px] text-muted-foreground/70">
                            {format(expense.date, 'd. MMM', { locale: dateLocale })}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => setChangingCategoryId(isChangingCategory ? null : expense.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            title={t('transactions.changeCategory')}
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onEditTransaction(expense)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteExpense(expense.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Category Change UI */}
                      {isChangingCategory && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mx-2 mb-2 pt-2 border-t border-border/50"
                        >
                          <p className="text-xs text-muted-foreground mb-2">{t('transactions.changeCategory')}:</p>
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
                              <SelectValue placeholder={t('transactions.allCategories')} />
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

                      {/* Items Expander */}
                      <TransactionItemsExpander
                        expenseId={expense.id}
                        isExpanded={expandedItemsId === expense.id}
                        onToggle={() => setExpandedItemsId(expandedItemsId === expense.id ? null : expense.id)}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

CategoryTransactionsDialog.displayName = 'CategoryTransactionsDialog';
