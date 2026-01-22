import { useState, useMemo } from 'react';
import { useIncomeSources } from '@/hooks/useIncomeSources';
import { useIncomeSourceStats } from '@/hooks/useIncomeSourceStats';
import { useIncomeSourceOwnership } from '@/hooks/useIncomeSourceOwnership';
import { IncomeSource } from '@/types/incomeSource';
import { Expense } from '@/types/expense';
import { IncomeSourceCard } from './IncomeSourceCard';
import { IncomeSourceDialog } from './IncomeSourceDialog';
import { IncomeSourceTransactionsDialog } from './IncomeSourceTransactionsDialog';
import { UnassignedIncomeDialog } from './UnassignedIncomeDialog';
import { MembersDialog } from './MembersDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, TrendingUp, CircleDashed } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';

interface IncomeSourcesPanelProps {
  expenses: Expense[];
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  onRefreshExpenses?: () => void;
}

export const IncomeSourcesPanel = ({
  expenses,
  onUpdateExpense,
  onDeleteExpense,
  onRefreshExpenses
}: IncomeSourcesPanelProps) => {
  const { t } = useTranslation();
  const {
    incomeSources, 
    loading, 
    addIncomeSource, 
    updateIncomeSource, 
    deleteIncomeSource 
  } = useIncomeSources();

  // Get member and pending stats for all sources
  const sourceIds = useMemo(() => incomeSources.map(s => s.id), [incomeSources]);
  const { stats: memberStats } = useIncomeSourceStats(sourceIds);
  
  // Check ownership for all sources
  const { isOwner, loading: ownershipLoading } = useIncomeSourceOwnership(sourceIds);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [selectedSource, setSelectedSource] = useState<IncomeSource | null>(null);
  const [transactionsDialogOpen, setTransactionsDialogOpen] = useState(false);
  const [unassignedDialogOpen, setUnassignedDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Expense | null>(null);
  const [editTransactionDialogOpen, setEditTransactionDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);

  // Calculate stats for each source (income - expenses = balance)
  const sourceStats = useMemo(() => {
    const stats: Record<string, { income: number; expenses: number; balance: number; count: number }> = {};
    
    incomeSources.forEach(source => {
      stats[source.id] = { income: 0, expenses: 0, balance: 0, count: 0 };
    });

    expenses
      .filter(e => e.income_source_id)
      .forEach(e => {
        if (e.income_source_id && stats[e.income_source_id]) {
          if (e.type === 'income') {
            stats[e.income_source_id].income += e.amount;
          } else {
            stats[e.income_source_id].expenses += e.amount;
          }
          stats[e.income_source_id].count += 1;
        }
      });

    // Calculate balance for each source
    Object.keys(stats).forEach(id => {
      stats[id].balance = stats[id].income - stats[id].expenses;
    });

    return stats;
  }, [expenses, incomeSources]);

  // Calculate unassigned income
  const unassignedStats = useMemo(() => {
    const unassignedIncome = expenses.filter(e => e.type === 'income' && !e.income_source_id);
    return {
      total: unassignedIncome.reduce((sum, e) => sum + e.amount, 0),
      count: unassignedIncome.length
    };
  }, [expenses]);

  const handleEdit = (source: IncomeSource) => {
    setEditingSource(source);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setSourceToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (sourceToDelete) {
      await deleteIncomeSource(sourceToDelete);
      setSourceToDelete(null);
      // Refresh expenses after deleting income source (as linked expenses are also deleted)
      onRefreshExpenses?.();
    }
    setDeleteConfirmOpen(false);
  };

  const handleSourceClick = (source: IncomeSource) => {
    setSelectedSource(source);
    setTransactionsDialogOpen(true);
  };

  const handleMembersClick = (source: IncomeSource) => {
    setSelectedSource(source);
    setMembersDialogOpen(true);
  };

  const handleSave = async (sourceData: Omit<IncomeSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    await addIncomeSource(sourceData);
    setEditingSource(null);
  };

  const handleUpdate = async (source: IncomeSource) => {
    await updateIncomeSource(source);
    setEditingSource(null);
  };

  const handleEditTransaction = (expense: Expense) => {
    setEditingTransaction(expense);
    setEditTransactionDialogOpen(true);
  };

  const handleTransactionSave = async (expense: Expense) => {
    await onUpdateExpense(expense);
    setEditTransactionDialogOpen(false);
    setEditingTransaction(null);
  };

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  if (loading || ownershipLoading) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-income" />
            <h2 className="text-lg font-semibold">{t('incomeSources.title')}</h2>
          </div>
          <Button
            size="sm"
            className="gap-1 rounded-xl"
            onClick={() => {
              setEditingSource(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            {t('incomeSources.addSource')}
          </Button>
        </div>

        {/* Income Sources List */}
        <div className="space-y-3">
          <AnimatePresence>
            {incomeSources.map((source) => {
              const sourceIsOwner = isOwner(source.id);
              return (
                <motion.div
                  key={source.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <IncomeSourceCard
                    source={source}
                    totalAmount={sourceStats[source.id]?.balance || 0}
                    incomeAmount={sourceStats[source.id]?.income || 0}
                    expenseAmount={sourceStats[source.id]?.expenses || 0}
                    transactionCount={sourceStats[source.id]?.count || 0}
                    memberCount={memberStats[source.id]?.memberCount || 0}
                    pendingCount={memberStats[source.id]?.pendingCount || 0}
                    isOwner={sourceIsOwner}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onClick={handleSourceClick}
                    onMembersClick={handleMembersClick}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {incomeSources.length === 0 && (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{t('incomeSources.noSources')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('incomeSources.addFirstSource', 'Dodaj prvi izvor za kategorizaciju prihoda')}
              </p>
            </div>
          )}

          {/* Unassigned Income - Clickable */}
          {unassignedStats.count > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setUnassignedDialogOpen(true)}
              className="p-4 rounded-xl border border-dashed bg-muted/30 cursor-pointer hover:bg-muted/50 hover:border-primary/30 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <CircleDashed className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">{t('incomeSources.unassigned')}</p>
                    <p className="text-sm text-muted-foreground">
                      {unassignedStats.count} {unassignedStats.count === 1 ? t('transactions.income').toLowerCase() : t('incomeSources.incomes', 'prihoda')} • {t('incomeSources.clickToAssign', 'Klikni za dodjelu')}
                    </p>
                  </div>
                </div>
                <p className="font-mono font-semibold text-income">
                  {formatAmount(unassignedStats.total)}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <IncomeSourceDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingSource(null);
        }}
        source={editingSource}
        onSave={handleSave}
        onUpdate={handleUpdate}
      />

      <IncomeSourceTransactionsDialog
        open={transactionsDialogOpen}
        onOpenChange={setTransactionsDialogOpen}
        source={selectedSource}
        expenses={expenses}
        onEditTransaction={handleEditTransaction}
        onDeleteTransaction={onDeleteExpense}
      />

      <EditTransactionDialog
        expense={editingTransaction}
        open={editTransactionDialogOpen}
        onOpenChange={setEditTransactionDialogOpen}
        onSave={handleTransactionSave}
      />

      <UnassignedIncomeDialog
        open={unassignedDialogOpen}
        onOpenChange={setUnassignedDialogOpen}
        expenses={expenses}
        incomeSources={incomeSources}
        onUpdateExpense={onUpdateExpense}
        onEditTransaction={handleEditTransaction}
        onDeleteExpense={onDeleteExpense}
        onAddIncomeSource={addIncomeSource}
      />

      <MembersDialog
        open={membersDialogOpen}
        onOpenChange={setMembersDialogOpen}
        source={selectedSource}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('incomeSources.deleteSource', 'Obriši izvor prihoda?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('incomeSources.deleteSourceDescription', 'Ova radnja ne može se poništiti. Prihodi povezani s ovim izvorom ostat će sačuvani, ali više neće biti povezani s izvorom.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
