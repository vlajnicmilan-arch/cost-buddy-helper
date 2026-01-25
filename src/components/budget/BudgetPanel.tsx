import { useState, useCallback } from 'react';
import { useBudgetPlans } from '@/hooks/useBudgetPlans';
import { useBudgetCategories } from '@/hooks/useBudgetCategories';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useBudgetMembers } from '@/hooks/useBudgetMembers';
import { BudgetPlan, BudgetPlanWithOwnership } from '@/types/budget';
import { BudgetCard } from './BudgetCard';
import { BudgetDialog } from './BudgetDialog';
import { BudgetFullScreenView } from './BudgetFullScreenView';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import { Plus, Wallet, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export const BudgetPanel = () => {
  const { t } = useTranslation();
  const { budgets, loading, addBudget, updateBudget, deleteBudget, refetch } = useBudgetPlans();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetPlan | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<BudgetPlanWithOwnership | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<string | null>(null);

  const handleEdit = (budget: BudgetPlan) => {
    setEditingBudget(budget);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setBudgetToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (budgetToDelete) {
      await deleteBudget(budgetToDelete);
      setDeleteConfirmOpen(false);
      setBudgetToDelete(null);
    }
  };

  const handleBudgetClick = (budget: BudgetPlanWithOwnership) => {
    setSelectedBudget(budget);
    setDetailDialogOpen(true);
  };

  const handleCloseFullScreen = () => {
    setDetailDialogOpen(false);
    setSelectedBudget(null);
    refetch();
  };

  const handleSave = async (budgetData: Omit<BudgetPlan, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    await addBudget(budgetData);
  };

  const handleUpdate = async (budget: BudgetPlan) => {
    await updateBudget(budget);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          {t('budget.title', 'Budžet')}
        </h3>
        <Button onClick={() => { setEditingBudget(null); setDialogOpen(true); }} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          {t('budget.add', 'Dodaj')}
        </Button>
      </div>

      {budgets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('budget.noBudgets', 'Nema budžeta')}</p>
          <p className="text-sm">{t('budget.noBudgetsHint', 'Kreiraj budžet za praćenje potrošnje')}</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {budgets.map((budget) => (
              <motion.div
                key={budget.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                layout
              >
                <BudgetCard
                  budget={budget}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onClick={handleBudgetClick}
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Create/Edit Dialog */}
      <BudgetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        budget={editingBudget}
        onSave={handleSave}
        onUpdate={handleUpdate}
      />

      {/* Full-screen Budget View */}
      <BudgetFullScreenView
        open={detailDialogOpen}
        onClose={handleCloseFullScreen}
        budget={selectedBudget}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('budget.deleteConfirmTitle', 'Obriši budžet?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('budget.deleteConfirmMessage', 'Ova akcija će trajno obrisati budžet i sve povezane kategorije i ciljeve.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
