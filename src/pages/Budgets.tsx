import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useBudgets } from '@/hooks/useBudgets';
import { BudgetSection } from '@/components/budget';
import { BottomNav } from '@/components/BottomNav';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Budgets = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const { allExpenses } = useExpenses();
  const { 
    budgets, 
    loading, 
    createBudget, 
    updateBudget, 
    deleteBudget, 
    resetBudget, 
    trendData,
    isLocalMode 
  } = useBudgets({ externalExpenses: allExpenses });

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLocalMode) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 text-center text-muted-foreground">
          <p>{t('budget.cloudOnly', 'Budžeti su dostupni samo u cloud načinu rada.')}</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <BudgetSection
          budgets={budgets}
          loading={loading}
          onCreateBudget={createBudget}
          onUpdateBudget={updateBudget}
          onDeleteBudget={deleteBudget}
          onResetBudget={resetBudget}
          trendData={trendData}
        />
      </div>
      <BottomNav />
    </div>
  );
};

export default Budgets;
