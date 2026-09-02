import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useBudgets } from '@/hooks/useBudgets';
import { BudgetSection } from '@/components/budget';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useModuleGate } from '@/hooks/useModuleGate';
import { ReadOnlyBanner } from '@/components/access/ReadOnlyBanner';

const Budgets = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const { hasModuleAccess } = useFeatureAccess();
  const { requestModule } = useModuleGate();
  const hasSmjerAccess = hasModuleAccess('smjer');
  const { allExpenses, refetch } = useExpenses();
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
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  const gatePromptedRef = useState<{ done: boolean }>({ done: false })[0];
  useEffect(() => {
    if (isLocalMode || loading || hasSmjerAccess || budgets.length > 0 || gatePromptedRef.done) return;
    gatePromptedRef.done = true;
    requestModule('smjer', { onDismiss: () => navigate('/home', { replace: true }) });
  }, [budgets.length, gatePromptedRef, hasSmjerAccess, isLocalMode, loading, navigate, requestModule]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLocalMode) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
        >
          <PageHeader title={t('nav.budgets', 'Budžeti')} />
          <div className="text-center text-muted-foreground mt-12">
            <p>{t('budget.cloudOnly', 'Budžeti su dostupni samo u cloud načinu rada.')}</p>
          </div>
        </motion.div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
      >
        <PageHeader
          title={t('nav.budgets', 'Budžeti')}
          onDataImported={refetch}
        />
        {!hasSmjerAccess && budgets.length > 0 && (
          <ReadOnlyBanner
            className="mb-4"
            title={t('budget.readOnlyTitle', 'Smjer je u načinu samo za pregled')}
            body={t('budget.readOnlyBody', 'Postojeće planove vidiš, ali nove planove i izmjene možeš raditi nakon aktivacije Smjera.')}
          />
        )}
        <BudgetSection
          budgets={budgets}
          loading={loading}
          canWrite={hasSmjerAccess}
          onCreateBudget={createBudget}
          onUpdateBudget={updateBudget}
          onDeleteBudget={deleteBudget}
          onResetBudget={resetBudget}
          trendData={trendData}
        />
      </motion.div>
      <BottomNav />
    </div>
  );
};

export default Budgets;
