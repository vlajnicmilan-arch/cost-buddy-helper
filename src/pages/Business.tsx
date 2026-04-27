import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Plus, ScanLine } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { BusinessBottomNav, BusinessTab } from '@/components/business/BusinessBottomNav';
import { BusinessDashboard } from '@/components/business/BusinessDashboard';
import { BusinessTransactions } from '@/components/business/BusinessTransactions';
import { BusinessReports } from '@/components/business/BusinessReports';
import { BusinessMore } from '@/components/business/BusinessMore';
import { BusinessWallet } from '@/components/business/BusinessWallet';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { Expense } from '@/types/expense';
import { useBackButton } from '@/hooks/useBackButton';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { BottomNav } from '@/components/BottomNav';
import { PageHeader } from '@/components/PageHeader';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface BusinessProfile {
  id: string;
  company_name: string;
  is_vat_payer: boolean;
  industry_type?: string;
  enabled_modules?: string[];
}

const Business = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeBusinessProfileId, setActiveBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { expenses: dashboardExpenses, allExpenses, loading, addExpense, updateExpense, deleteExpense, importFromCSV, findDuplicates, checkDuplicate } = useExpenses();
  const { totalReceivable, totalPayable } = useBusinessDebts();
  const { hasAccess, getRequiredTier } = useFeatureAccess();
  const canAccessBusiness = hasAccess('business_module');

  const [activeTab, setActiveTab] = useState<BusinessTab>('dashboard');
  const [profile, setProfile] = useState<BusinessProfile | null>(null);


  useBackButton(activeTab !== 'dashboard', () => setActiveTab('dashboard'));

  useEffect(() => {
    if (!activeBusinessProfileId) navigate('/home', { replace: true });
  }, [activeBusinessProfileId, navigate]);

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    supabase
      .from('business_profiles')
      .select('id, company_name, is_vat_payer, industry_type, enabled_modules')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => { if (data) setProfile(data as any); });
  }, [activeBusinessProfileId, user]);

  // Gate: if user doesn't have business access, show upgrade prompt
  if (!canAccessBusiness) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8"
        >
          <PageHeader title="Poslovanje" />
          <UpgradePrompt
            feature="Poslovni modul"
            requiredTier={getRequiredTier('business_module')}
            className="mt-12"
          />
        </motion.div>
        <BottomNav />
      </div>
    );
  }


  const handleBackToPersonal = () => {
    setActiveBusinessProfileId(null);
    navigate('/home');
  };

  const handleEditExpense = async (updatedExpense: Expense) => {
    await updateExpense(updatedExpense);
  };

  if (!activeBusinessProfileId) return null;

  return (
    <div className="business-mode min-h-dvh bg-background pb-16">
      {/* Compact business header */}
      <div className="sticky top-0 z-40 bg-primary safe-area-top">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <button
            onClick={handleBackToPersonal}
            className="w-7 h-7 rounded-lg bg-primary-foreground/15 flex items-center justify-center text-primary-foreground hover:bg-primary-foreground/25 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <h1 className="text-sm font-bold text-primary-foreground truncate">
              {profile?.company_name || 'Tvrtka'}
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {activeTab === 'dashboard' && (
          <BusinessDashboard
            expenses={dashboardExpenses}
            totalReceivable={totalReceivable}
            totalPayable={totalPayable}
          />
        )}
        {activeTab === 'wallet' && (
          <BusinessWallet />
        )}
        {activeTab === 'transactions' && (
          <BusinessTransactions
            expenses={dashboardExpenses}
            onAddClick={() => {}}
            addAction={
              <AddExpenseDialog
                onAdd={addExpense}
                checkDuplicate={checkDuplicate}
                triggerIcon={<Plus className="w-3.5 h-3.5" />}
                triggerLabel={t('business.transactions.new', 'Novo')}
                triggerClassName="h-9 gap-1 px-3 text-sm"
              />
            }
            scanAction={
              <AddExpenseDialog
                onAdd={addExpense}
                checkDuplicate={checkDuplicate}
                autoScan
                triggerVariant="scan"
                triggerIcon={<ScanLine className="w-3.5 h-3.5" />}
                triggerLabel={t('common.scan', 'Skeniraj')}
                triggerClassName="h-9 gap-1 px-3 text-sm"
              />
            }
            onEditExpense={handleEditExpense}
            onDeleteExpense={deleteExpense}
            onImportCSV={importFromCSV}
            findDuplicates={findDuplicates}
            existingExpenses={allExpenses}
          />
        )}
        {activeTab === 'reports' && (
          <BusinessReports
            expenses={dashboardExpenses}
            companyName={profile?.company_name || 'Tvrtka'}
          />
        )}
        {activeTab === 'more' && (
          <BusinessMore expenses={dashboardExpenses} />
        )}
      </div>

      <BusinessBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Business;
