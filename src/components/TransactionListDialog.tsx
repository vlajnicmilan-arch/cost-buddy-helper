import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Expense, getCategoryInfo, getPaymentSourceInfo, Category } from '@/types/expense';
import { EditTransactionDialog } from './EditTransactionDialog';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from './TransactionFilters';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp, TrendingDown, CheckSquare, Eye, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { TransactionItemsExpander } from './TransactionItemsExpander';
import { ImportBatchDialog } from './ImportBatchDialog';

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
  const { t } = useTranslation();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [importBatchDialogOpen, setImportBatchDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const { customPaymentSources } = useCustomPaymentSources();
  const { formatAmount } = useCurrency();

  // Get all cards from all custom payment sources
  const allCards = useMemo(() => {
    return customPaymentSources.flatMap(source => source.cards || []);
  }, [customPaymentSources]);

  const typeFilteredExpenses = useMemo(() => {
    const filtered = expenses.filter(e => e.type === type);
    // Sort by created_at desc to keep import batch items grouped together
    return filtered.sort((a, b) => {
      if (a.import_batch_id && b.import_batch_id && a.import_batch_id === b.import_batch_id) {
        return b.date.getTime() - a.date.getTime();
      }
      const createdA = a.created_at ?? '';
      const createdB = b.created_at ?? '';
      if (createdB > createdA) return 1;
      if (createdB < createdA) return -1;
      return 0;
    });
  }, [expenses, type]);

  const filteredExpenses = useMemo(() => {
    return applyFilters(typeFilteredExpenses, filters);
  }, [typeFilteredExpenses, filters]);

  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);


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

  const handleDeleteBatch = async (expenseIds: string[]) => {
    const visibleIds = new Set(filteredExpenses.map((expense) => expense.id));
    const safeIds = expenseIds.filter((id) => visibleIds.has(id));
    await Promise.all(safeIds.map((id) => onDelete(id)));
    setImportBatchDialogOpen(false);
    setSelectedBatchId(null);
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
  const handleBulkCategoryChange = async (category: Category) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onUpdate({ ...expense, category });
        successCount++;
      } catch (error) {
        console.error('Error updating expense:', error);
      }
    }
    
    toast.success(t('transactions.categoryChanged', { count: successCount }));
    clearSelection();
  };

  const handleBulkPaymentSourceChange = async (paymentSource: string) => {
    const selectedExpenses = filteredExpenses.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onUpdate({ 
          ...expense, 
          payment_source: paymentSource as any, // Custom sources use custom:id format
          payment_source_card_id: null // Clear card when changing source
        });
        successCount++;
      } catch (error) {
        console.error('Error updating expense:', error);
      }
    }
    
    toast.success(t('transactions.paymentSourceChanged', { count: successCount }));
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const selectedExpenses = filteredExpenses.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onDelete(expense.id);
        successCount++;
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    }
    
    toast.success(t('transactions.deleted', { count: successCount }));
    clearSelection();
  };

  // Reset filters when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFilters(defaultFilters);
      clearSelection();
    }
    onOpenChange(open);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DialogTitle className="flex items-center gap-2">
                  {type === 'income' ? (
                    <>
                      <TrendingUp className="w-5 h-5 text-income" />
                      <span>{t('transactions.incomes', 'Prihodi')}</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-5 h-5 text-expense" />
                      <span>{t('transactions.expenses', 'Troškovi')}</span>
                    </>
                  )}
                </DialogTitle>
                {selectedIds.size > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">
                    {selectedIds.size} {t('common.selected', 'odabrano')}
                  </span>
                )}
              </div>
              {filteredExpenses.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectedIds.size === filteredExpenses.length ? clearSelection : selectAll}
                  className="h-7 text-xs gap-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {selectedIds.size === filteredExpenses.length ? t('common.cancelSelection', 'Poništi odabir') : t('common.selectAll', 'Odaberi sve')}
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Filters */}
          <TransactionFilters
            filters={filters}
            onFiltersChange={setFilters}
            showCardFilter={allCards.length > 0}
            cards={allCards}
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
            showCategoryChange={type === 'expense'}
          />

          {/* Summary */}
          <div className={cn(
            "p-4 rounded-xl shrink-0",
            type === 'income' ? "bg-income/10" : "bg-expense/10"
          )}>
            <p className="text-sm text-muted-foreground mb-1">
              {t('transactions.shown', 'Prikazano')} ({filteredExpenses.length} {t('transactions.of', 'od')} {typeFilteredExpenses.length})
            </p>
            <p className={cn(
              "text-2xl font-bold font-mono",
              type === 'income' ? "text-income" : "text-expense"
            )}>
              {type === 'expense' ? '-' : ''}{formatAmount(filteredTotal)}
            </p>
          </div>

          {/* Transaction List */}
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {filteredExpenses.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">
                  {typeFilteredExpenses.length === 0 
                    ? (type === 'income' ? t('transactions.noIncome', 'Nema prihoda') : t('transactions.noExpenses', 'Nema troškova'))
                    : t('transactions.noResults', 'Nema rezultata za odabrane filtere')}
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {filteredExpenses.map((expense, index) => {
                  const categoryInfo = getCategoryInfo(expense.category);
                  const paymentInfo = getPaymentSourceInfo(expense.payment_source || 'cash');
                  const isSelected = selectedIds.has(expense.id);
                  const prevExpense = index > 0 ? filteredExpenses[index - 1] : null;
                  const showBatchStart = expense.import_batch_id && (!prevExpense || prevExpense.import_batch_id !== expense.import_batch_id);
                  const batchExpenseCount = showBatchStart
                    ? filteredExpenses.filter((item) => item.import_batch_id === expense.import_batch_id).length
                    : 0;
                  
                  return (
                    <div key={expense.id}>
                      {showBatchStart && (
                        <div
                          className="flex items-center gap-2 my-2 px-2 cursor-pointer group"
                          onClick={() => {
                            setSelectedBatchId(expense.import_batch_id!);
                            setImportBatchDialogOpen(true);
                          }}
                        >
                          <div className="flex-1 h-px bg-destructive/40" />
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 group-hover:bg-destructive/20 transition-colors">
                            <FileText className="w-3 h-3 text-destructive" />
                            <span className="text-[11px] font-medium text-destructive">
                              Uvoz • {batchExpenseCount} tr.
                            </span>
                          </div>
                          <div className="flex-1 h-px bg-destructive/40" />
                        </div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={cn(
                          "flex items-center gap-2 py-2.5 px-2 rounded-lg transition-colors cursor-pointer",
                          isSelected 
                            ? "bg-primary/10" 
                            : "hover:bg-muted/50"
                        )}
                        onClick={() => {
                          setDetailExpense(expense);
                          setDetailDialogOpen(true);
                        }}
                      >
                        {/* Checkbox */}
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(expense.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        />

                        {/* Category Icon */}
                        <div 
                          className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: `hsl(var(--${categoryInfo.color}) / 0.15)` }}
                        >
                          {categoryInfo.icon}
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-medium text-foreground truncate text-sm leading-tight">
                            {expense.merchant_name || expense.description}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight">
                            <span>{paymentInfo.icon} {paymentInfo.name}</span>
                            <span className="text-muted-foreground/40">•</span>
                            <span className="truncate max-w-[60px]">{categoryInfo.name}</span>
                          </div>
                        </div>

                        {/* Amount & Date */}
                        <div className="flex flex-col items-end shrink-0 gap-0.5">
                          <p className={cn(
                            "font-mono font-bold text-sm leading-tight",
                            type === 'income' ? "text-income" : "text-expense"
                          )}>
                            {type === 'expense' ? '-' : '+'}{formatAmount(expense.amount)}
                          </p>
                          <span className="text-[10px] text-muted-foreground/70">
                            {format(expense.date, 'd. MMM', { locale: hr })}
                          </span>
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {t('transactions.details', 'Detalji transakcije')}
            </DialogTitle>
          </DialogHeader>

          {detailExpense && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
              {/* Transaction summary */}
              <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg shrink-0">
                  {getCategoryInfo(detailExpense.category).icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{detailExpense.merchant_name || detailExpense.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(detailExpense.date, 'd. MMM yyyy', { locale: hr })}
                    {' • '}
                    {getPaymentSourceInfo(detailExpense.payment_source || 'cash').name}
                  </p>
                </div>
                <div className={cn(
                  "font-mono font-medium shrink-0",
                  type === 'income' ? "text-income" : "text-expense"
                )}>
                  {type === 'income' ? '+' : '-'}{formatAmount(detailExpense.amount)}
                </div>
              </div>

              {/* Items */}
              <TransactionItemsExpander
                expenseId={detailExpense.id}
                isExpanded={true}
                onToggle={() => {}}
              />

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setDetailDialogOpen(false);
                    handleEdit(detailExpense);
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('common.edit', 'Uredi')}
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setDetailDialogOpen(false);
                    handleDelete(detailExpense.id);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('common.delete', 'Obriši')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditTransactionDialog
        expense={editingExpense}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSave}
      />

      {selectedBatchId && (
        <ImportBatchDialog
          open={importBatchDialogOpen}
          onOpenChange={(open) => {
            setImportBatchDialogOpen(open);
            if (!open) setSelectedBatchId(null);
          }}
          batchId={selectedBatchId}
          allExpenses={filteredExpenses}
          onDeleteBatch={handleDeleteBatch}
        />
      )}
    </>
  );
};
