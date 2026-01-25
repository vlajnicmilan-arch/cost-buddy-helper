import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BudgetCard } from './BudgetCard';
import { BudgetDetailDialog } from './BudgetDetailDialog';
import { BudgetDialog } from './BudgetDialog';
import { BudgetWithStats } from '@/types/budget';
import { Plus, Target, Loader2 } from 'lucide-react';

interface BudgetSectionProps {
  budgets: BudgetWithStats[];
  loading: boolean;
  onCreateBudget: (budget: Partial<BudgetWithStats>) => Promise<void>;
  onUpdateBudget: (budget: BudgetWithStats) => Promise<void>;
  onDeleteBudget: (id: string) => Promise<void>;
  onResetBudget: (id: string) => Promise<void>;
  trendData?: { date: string; spent: number; limit: number }[];
}

export const BudgetSection = ({
  budgets,
  loading,
  onCreateBudget,
  onUpdateBudget,
  onDeleteBudget,
  onResetBudget,
}: BudgetSectionProps) => {
  const { t } = useTranslation();
  const [selectedBudget, setSelectedBudget] = useState<BudgetWithStats | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithStats | null>(null);

  const handleCardClick = (budget: BudgetWithStats) => {
    setSelectedBudget(budget);
    setDetailDialogOpen(true);
  };

  const handleEdit = (budget: BudgetWithStats) => {
    setEditingBudget(budget);
    setCreateDialogOpen(true);
  };

  const handleDialogClose = () => {
    setCreateDialogOpen(false);
    setEditingBudget(null);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">{t('budget.title', 'Budžeti')}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {budgets.length} {t('budget.activeBudgets', 'aktivnih budžeta')}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('budget.create', 'Novi budžet')}</span>
        </Button>
      </div>


      {/* Budget Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-8 px-4">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
            <Target className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium mb-1">{t('budget.noBudgets', 'Nema budžeta')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('budget.noBudgetsHint', 'Koristi gumb iznad za kreiranje prvog budžeta')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onClick={() => handleCardClick(budget)}
              onEdit={() => handleEdit(budget)}
              onDelete={() => onDeleteBudget(budget.id)}
              onReset={() => onResetBudget(budget.id)}
            />
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <BudgetDetailDialog
        budget={selectedBudget}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={() => {
          if (selectedBudget) {
            setDetailDialogOpen(false);
            handleEdit(selectedBudget);
          }
        }}
      />

      {/* Create/Edit Dialog */}
      <BudgetDialog
        budget={editingBudget}
        open={createDialogOpen}
        onOpenChange={handleDialogClose}
        onSave={async (budget) => {
          if (editingBudget) {
            await onUpdateBudget(budget as BudgetWithStats);
          } else {
            await onCreateBudget(budget);
          }
          handleDialogClose();
        }}
      />
    </motion.section>
  );
};
