import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { IncomeSource } from '@/types/incomeSource';
import { Expense, getCategoryInfo, getPaymentSourceInfo, Category } from '@/types/expense';
import { TransactionFilters, FilterState, defaultFilters, applyFilters, MemberOption } from '@/components/TransactionFilters';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { useIncomeSourceMembers } from '@/hooks/useIncomeSourceMembers';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp, Clock, User, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface IncomeSourceTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: IncomeSource | null;
  expenses: Expense[];
  onEditTransaction: (expense: Expense) => void;
  onDeleteTransaction: (id: string) => Promise<void>;
  onUpdateTransaction?: (expense: Expense) => Promise<void>;
}

export const IncomeSourceTransactionsDialog = ({
  open,
  onOpenChange,
  source,
  expenses,
  onEditTransaction,
  onDeleteTransaction,
  onUpdateTransaction
}: IncomeSourceTransactionsDialogProps) => {
  const { user } = useAuth();
  const { isOwner } = useIncomeSourceMembers(source?.id || null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch member profiles for displaying submitter names
  useEffect(() => {
    const fetchMemberProfiles = async () => {
      if (!source || !open) return;
      
      // Get unique user IDs from transactions (submitted_by or user_id)
      const userIds = new Set<string>();
      expenses.forEach(e => {
        if (e.income_source_id === source.id) {
          if (e.submitted_by) userIds.add(e.submitted_by);
          if (e.user_id) userIds.add(e.user_id);
        }
      });

      if (userIds.size === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', Array.from(userIds));

      if (data) {
        const profileMap: Record<string, string> = {};
        data.forEach(p => {
          profileMap[p.user_id] = p.display_name || 'Nepoznat';
        });
        setMemberProfiles(profileMap);
      }
    };

    fetchMemberProfiles();
  }, [source, expenses, open]);

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
    // Only select transactions user can edit (owner or own transactions)
    const editableIds = filteredTransactions
      .filter(e => isOwner || e.user_id === user?.id)
      .map(e => e.id);
    setSelectedIds(new Set(editableIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk operations
  const handleBulkCategoryChange = async (category: Category) => {
    if (!onUpdateTransaction) return;
    const selectedExpenses = filteredTransactions.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onUpdateTransaction({ ...expense, category });
        successCount++;
      } catch (error) {
        console.error('Error updating expense:', error);
      }
    }
    
    toast.success(`Kategorija promijenjena za ${successCount} transakcija`);
    clearSelection();
  };

  const handleBulkPaymentSourceChange = async (paymentSource: string) => {
    if (!onUpdateTransaction) return;
    const selectedExpenses = filteredTransactions.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onUpdateTransaction({ 
          ...expense, 
          payment_source: paymentSource as any,
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
    const selectedExpenses = filteredTransactions.filter(e => selectedIds.has(e.id));
    let successCount = 0;
    
    for (const expense of selectedExpenses) {
      try {
        await onDeleteTransaction(expense.id);
        successCount++;
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    }
    
    toast.success(`Obrisano ${successCount} transakcija`);
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

  // Build member options from profiles
  const memberOptions: MemberOption[] = useMemo(() => {
    return Object.entries(memberProfiles).map(([userId, displayName]) => ({
      userId,
      displayName,
    }));
  }, [memberProfiles]);

  if (!source) return null;

  const sourceColor = source.color || '#22c55e';
  const sourceIcon = source.icon || '💰';

  // Count editable transactions
  const editableCount = filteredTransactions.filter(e => isOwner || e.user_id === user?.id).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-3">
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
            {isOwner && onUpdateTransaction && editableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={selectedIds.size === editableCount ? clearSelection : selectAll}
                className="h-7 text-xs gap-1.5 shrink-0"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {selectedIds.size === editableCount ? 'Poništi' : 'Odaberi sve'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Filters */}
        <TransactionFilters
          filters={filters}
          onFiltersChange={setFilters}
          showMemberFilter={memberOptions.length > 1}
          members={memberOptions}
          className="shrink-0"
        />

        {/* Bulk Actions Toolbar - only show if user can edit and has onUpdateTransaction */}
        {isOwner && onUpdateTransaction && (
          <BulkActionsToolbar
            selectedCount={selectedIds.size}
            totalCount={editableCount}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkCategoryChange={handleBulkCategoryChange}
            onBulkPaymentSourceChange={handleBulkPaymentSourceChange}
            onBulkDelete={handleBulkDelete}
          />
        )}

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
                const isPending = expense.status === 'pending';
                // Only owner can edit/delete, and only their own transactions can members delete
                const canEdit = isOwner || expense.user_id === user?.id;
                const canDelete = isOwner || expense.user_id === user?.id;
                const isSelected = selectedIds.has(expense.id);
                
                return (
                  <motion.div
                    key={expense.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl transition-colors group",
                      isSelected 
                        ? "bg-primary/10 border border-primary/30" 
                        : "bg-muted/50 hover:bg-muted/80"
                    )}
                  >
                    {/* Checkbox - only for editable items */}
                    {isOwner && onUpdateTransaction && canEdit && !isPending && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(expense.id)}
                        className="shrink-0"
                      />
                    )}

                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg">
                      {categoryInfo.icon}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{expense.description}</p>
                        {isPending && (
                          <Badge variant="secondary" className="gap-1 h-5 text-xs">
                            <Clock className="w-3 h-3" />
                            Čeka
                          </Badge>
                        )}
                        {/* Show submitter badge if transaction is from another member */}
                        {expense.user_id !== user?.id && (
                          <Badge variant="outline" className="gap-1 h-5 text-xs bg-primary/10 border-primary/20">
                            <User className="w-3 h-3" />
                            {memberProfiles[expense.submitted_by || expense.user_id] || 'Član'}
                          </Badge>
                        )}
                      </div>
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

                    {/* Actions - Only for owner or own transactions */}
                    {(canEdit || canDelete) && !isPending && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onEditTransaction(expense)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete && isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => onDeleteTransaction(expense.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
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
};
