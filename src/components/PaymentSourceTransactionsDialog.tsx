import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Expense, getCategoryInfo, Category } from '@/types/expense';
import { EditTransactionDialog } from './EditTransactionDialog';
import { TransactionDetailDialog } from './TransactionDetailDialog';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { useCurrency } from '@/contexts/CurrencyContext';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp, TrendingDown, ArrowLeftRight, CreditCard, CheckSquare, Search, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useBackButton } from '@/hooks/useBackButton';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const { formatAmount } = useCurrency();

  const handleClose = () => {
    clearSelection();
    setSearchTerm('');
    onOpenChange(false);
  };

  useBackButton(open, handleClose);

  // Filter expenses for this payment source
  const sourceExpenses = useMemo(() => {
    if (!paymentSource) return [];
    
    return expenses.filter(e => {
      if (e.payment_source?.startsWith(`custom:${paymentSource.id}`)) return true;
      if (e.payment_source === paymentSource.id) return true;
      if (e.payment_source_card_id && paymentSource.cards) {
        return paymentSource.cards.some(card => card.id === e.payment_source_card_id);
      }
      if (e.type === 'transfer' && e.income_source_id === paymentSource.id) return true;
      return false;
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [expenses, paymentSource]);

  // Calculate running balance for each transaction (chronological order, newest first)
  const runningBalances = useMemo(() => {
    if (!paymentSource || sourceExpenses.length === 0) return new Map<string, number>();
    
    // We need chronological order (oldest first) to compute running balance
    const chronological = [...sourceExpenses].reverse();
    const balanceMap = new Map<string, number>();
    
    // Start from balance minus all transaction effects to get the "before all" balance
    let runningBalance = paymentSource.balance;
    
    // First, compute what the balance was before all these transactions
    // by reversing all of them from current balance
    for (const e of sourceExpenses) {
      const isInbound = e.type === 'transfer' && e.income_source_id === paymentSource.id;
      if (e.type === 'income' || isInbound) {
        runningBalance -= e.amount; // reverse income
      } else if (e.type === 'expense') {
        runningBalance += e.amount; // reverse expense
      } else if (e.type === 'transfer' && !isInbound) {
        runningBalance += e.amount; // reverse outbound transfer
      }
    }
    
    // Now walk forward chronologically, applying each transaction
    for (const e of chronological) {
      const isInbound = e.type === 'transfer' && e.income_source_id === paymentSource.id;
      if (e.type === 'income' || isInbound) {
        runningBalance += e.amount;
      } else if (e.type === 'expense') {
        runningBalance -= e.amount;
      } else if (e.type === 'transfer' && !isInbound) {
        runningBalance -= e.amount;
      }
      balanceMap.set(e.id, runningBalance);
    }
    
    return balanceMap;
  }, [sourceExpenses, paymentSource]);

  // Apply search filter
  const filteredSourceExpenses = useMemo(() => {
    if (!searchTerm.trim()) return sourceExpenses;
    const term = searchTerm.toLowerCase();
    return sourceExpenses.filter(e => 
      e.description.toLowerCase().includes(term) ||
      e.merchant_name?.toLowerCase().includes(term)
    );
  }, [sourceExpenses, searchTerm]);

  // Calculate totals
  const { totalIncome, totalExpenses: totalExp, totalTransfers } = useMemo(() => {
    return sourceExpenses.reduce((acc, e) => {
      if (e.type === 'income') acc.totalIncome += e.amount;
      else if (e.type === 'expense') acc.totalExpenses += e.amount;
      else if (e.type === 'transfer') {
        if (e.income_source_id === paymentSource?.id) {
          acc.totalIncome += e.amount;
        } else {
          acc.totalTransfers += e.amount;
        }
      }
      return acc;
    }, { totalIncome: 0, totalExpenses: 0, totalTransfers: 0 });
  }, [sourceExpenses, paymentSource]);

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

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => setSelectedIds(new Set(filteredSourceExpenses.map(e => e.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkCategoryChange = async (category: Category) => {
    const selected = filteredSourceExpenses.filter(e => selectedIds.has(e.id));
    let count = 0;
    for (const expense of selected) {
      try { await onUpdate({ ...expense, category }); count++; } catch {}
    }
    toast.success(t('transactions.categoryChanged', { count }));
    clearSelection();
  };

  const handleBulkPaymentSourceChange = async (newPaymentSource: string) => {
    const selected = filteredSourceExpenses.filter(e => selectedIds.has(e.id));
    let count = 0;
    for (const expense of selected) {
      try { await onUpdate({ ...expense, payment_source: newPaymentSource as any, payment_source_card_id: null }); count++; } catch {}
    }
    toast.success(t('transactions.paymentSourceChanged', { count }));
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const selected = filteredSourceExpenses.filter(e => selectedIds.has(e.id));
    let count = 0;
    for (const expense of selected) {
      try { await onDelete(expense.id); count++; } catch {}
    }
    toast.success(t('transactions.deleted', { count }));
    clearSelection();
  };

  if (!paymentSource) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <span 
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: paymentSource.color + '20', color: paymentSource.color }}
                >
                  {paymentSource.icon}
                </span>
                <div className="min-w-0">
                  <h1 className="text-base font-semibold truncate">{paymentSource.name}</h1>
                  <p className="text-xs text-muted-foreground">
                    {sourceExpenses.length} {t('transactions.transactions')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {filteredSourceExpenses.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectedIds.size === filteredSourceExpenses.length ? clearSelection : selectAll}
                    className="h-7 text-xs gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {selectedIds.size === filteredSourceExpenses.length ? t('common.cancelSelection') : t('common.selectAll')}
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                  <XIcon className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-4">
                {/* Balance & Summary */}
                <div className="grid grid-cols-2 gap-3">
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
                    <p className="text-sm font-semibold text-primary font-mono">+{formatAmount(totalIncome)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="w-3 h-3 text-destructive" />
                      <p className="text-xs text-muted-foreground">{t('summary.totalExpenses')}</p>
                    </div>
                    <p className="text-sm font-semibold text-expense font-mono">-{formatAmount(totalExp)}</p>
                  </div>
                </div>

                {/* Cards */}
                {paymentSource.cards && paymentSource.cards.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {paymentSource.cards.map(card => (
                      <motion.div 
                        key={card.id}
                        whileHover={{ scale: 1.05 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs"
                        style={{ 
                          borderColor: paymentSource.color + '40',
                          borderLeftWidth: 3,
                          borderLeftColor: paymentSource.color,
                          backgroundColor: paymentSource.color + '10'
                        }}
                      >
                        <CreditCard className="w-3 h-3" style={{ color: paymentSource.color }} />
                        <span className="font-medium">{card.card_name}</span>
                        <span className="text-muted-foreground">****{card.last_four_digits}</span>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={t('transactions.searchByName')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-9 h-9 text-sm"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Bulk Actions */}
                <BulkActionsToolbar
                  selectedCount={selectedIds.size}
                  totalCount={filteredSourceExpenses.length}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  onBulkCategoryChange={handleBulkCategoryChange}
                  onBulkPaymentSourceChange={handleBulkPaymentSourceChange}
                  onBulkDelete={handleBulkDelete}
                />

                {/* Transaction List */}
                {filteredSourceExpenses.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground">
                      {sourceExpenses.length === 0 
                        ? t('transactions.noTransactions')
                        : t('transactions.noSearchResults')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    <AnimatePresence>
                      {filteredSourceExpenses.map((expense) => {
                        const categoryInfo = getCategoryInfo(expense.category);
                        const cardInfo = getCardInfo(expense);
                        const isSelected = selectedIds.has(expense.id);
                        const balanceAfter = runningBalances.get(expense.id);
                        
                        return (
                          <div key={expense.id}>
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              onClick={() => {
                                if (selectedIds.size === 0) {
                                  setDetailExpense(expense);
                                  setDetailDialogOpen(true);
                                }
                              }}
                              className={cn(
                                "group py-2.5 px-2 rounded-lg transition-colors cursor-pointer active:bg-muted/70",
                                isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                              )}
                            >
                              {/* Row 1: Checkbox + Icon + Description + Amount */}
                              <div className="flex items-center gap-2">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleSelection(expense.id)}
                                    className="shrink-0"
                                  />
                                </div>
                                <div 
                                  className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                                  style={{ backgroundColor: expense.type === 'transfer' 
                                    ? 'hsl(var(--muted))' 
                                    : `hsl(var(--${categoryInfo.color}) / 0.15)` 
                                  }}
                                >
                                  {expense.type === 'transfer' ? (
                                    <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                                  ) : (
                                    categoryInfo.icon
                                  )}
                                </div>
                                <p className="flex-1 min-w-0 font-medium text-foreground truncate text-sm leading-tight">
                                  {expense.merchant_name || expense.description}
                                </p>
                                {(() => {
                                  const isInboundTransfer = expense.type === 'transfer' && expense.income_source_id === paymentSource?.id;
                                  const colorClass = expense.type === 'income' || isInboundTransfer ? 'text-income' : 
                                    expense.type === 'expense' ? 'text-expense' : 'text-muted-foreground';
                                  const prefix = expense.type === 'expense' ? '-' : 
                                    (expense.type === 'income' || isInboundTransfer) ? '+' : '↔';
                                  return (
                                    <p className={cn("font-mono font-bold text-base leading-tight shrink-0", colorClass)}>
                                      {prefix}{formatAmount(expense.amount)}
                                    </p>
                                  );
                                })()}
                              </div>

                              {/* Row 2: Category/Type + Running Balance + Date + Actions */}
                              <div className="flex items-center gap-1.5 mt-1.5 ml-[calc(1rem+2rem+0.5rem)]">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground leading-tight min-w-0">
                                  {expense.type === 'expense' && (
                                    <span className="truncate max-w-[80px]">{categoryInfo.name}</span>
                                  )}
                                  {expense.type === 'transfer' && expense.income_source_id === paymentSource?.id && (
                                    <span className="text-income">{t('transactions.transfer', 'Prijenos')} ↓</span>
                                  )}
                                  {expense.type === 'transfer' && expense.income_source_id !== paymentSource?.id && (
                                    <span className="text-primary">{t('transactions.transfer', 'Prijenos')} ↑</span>
                                  )}
                                  {expense.type === 'income' && (
                                    <span className="text-income">{t('transactions.income', 'Prihod')}</span>
                                  )}
                                  {cardInfo && (
                                    <>
                                      <span className="text-muted-foreground/40">•</span>
                                      <span className="text-[11px] font-mono">••{cardInfo.last_four_digits}</span>
                                    </>
                                  )}
                                  <span className="text-muted-foreground/40">•</span>
                                  <span className="text-[11px] text-muted-foreground/70">
                                    {format(expense.date, 'd. MMM', { locale: hr })}
                                  </span>
                                </div>
                                <div className="flex-1" />
                                {balanceAfter !== undefined && (
                                  <span className={cn(
                                    "text-[11px] font-mono font-semibold leading-tight px-1.5 py-0.5 rounded shrink-0",
                                    balanceAfter >= 0 
                                      ? "bg-primary/10 text-primary" 
                                      : "bg-destructive/10 text-destructive"
                                  )}>
                                    {formatAmount(balanceAfter)}
                                  </span>
                                )}
                              </div>
                            </motion.div>
                          </div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      <TransactionDetailDialog
        expense={detailExpense}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={(expense) => {
          setDetailDialogOpen(false);
          handleEdit(expense);
        }}
        onDelete={(id) => {
          setDetailDialogOpen(false);
          handleDelete(id);
        }}
      />

      <EditTransactionDialog
        expense={editingExpense}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSave}
      />
    </>
  );
};
