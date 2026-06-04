import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BudgetCard } from './BudgetCard';
import { BudgetFullScreenView } from './BudgetFullScreenView';
import { BudgetDialog } from './BudgetDialog';
import { BudgetWithStats } from '@/types/budget';
import { Plus, Target, Loader2, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

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
  const location = useLocation();
  const [selectedBudget, setSelectedBudget] = useState<BudgetWithStats | null>(null);
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Handle navigation from notification click
  useEffect(() => {
    const state = location.state as { openBudgetId?: string } | null;
    if (state?.openBudgetId && budgets.length > 0) {
      const budget = budgets.find(b => b.id === state.openBudgetId);
      if (budget) {
        setSelectedBudget(budget);
        setFullScreenOpen(true);
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, budgets]);

  const handleCardClick = (budget: BudgetWithStats) => {
    setSelectedBudget(budget);
    setFullScreenOpen(true);
  };

  const handleEdit = (budget: BudgetWithStats) => {
    setEditingBudget(budget);
    setCreateDialogOpen(true);
  };

  const handleDialogClose = () => {
    setCreateDialogOpen(false);
    setEditingBudget(null);
  };

  const handleCloseFullScreen = () => {
    setFullScreenOpen(false);
    setSelectedBudget(null);
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
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-module/10 flex items-center justify-center">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 text-module" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">{t('budget.title', 'Budžeti')}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {budgets.length} {t('budget.activeBudgets', 'aktivnih budžeta')}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm" variant="module" className="gap-1.5">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('budget.create', 'Novi budžet')}</span>
        </Button>
      </div>

      {/* Budget Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : budgets.length === 0 ? (
        <EmptyState
          variant="budgets"
          title={t('budget.noBudgets', 'Nema budžeta')}
          description={t('budget.noBudgetsHint', 'Koristi gumb iznad za kreiranje prvog budžeta')}
          action={{ label: t('budget.create', 'Novi budžet'), onClick: () => setCreateDialogOpen(true) }}
        />
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('budget.searchPlaceholder', 'Pretraži budžete...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9 h-9 text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {budgets
              .filter(b => !searchTerm.trim() || b.name.toLowerCase().includes(searchTerm.toLowerCase()) || b.description?.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((budget) => (
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
        </>
      )}

      {/* Full-Screen Budget View */}
      <BudgetFullScreenView
        open={fullScreenOpen}
        onClose={handleCloseFullScreen}
        budget={selectedBudget}
        onEdit={() => {
          if (selectedBudget) {
            setFullScreenOpen(false);
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
