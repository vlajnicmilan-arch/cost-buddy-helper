import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, User } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useExpenseFetch } from '@/hooks/useExpenseFetch';
import { useExpenseCRUD } from '@/hooks/useExpenseCRUD';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { BusinessBottomNav, BusinessTab } from '@/components/business/BusinessBottomNav';
import { BusinessDashboard } from '@/components/business/BusinessDashboard';
import { BusinessTransactions } from '@/components/business/BusinessTransactions';
import { BusinessReports } from '@/components/business/BusinessReports';
import { BusinessMore } from '@/components/business/BusinessMore';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { Expense } from '@/types/expense';

interface BusinessProfile {
  id: string;
  company_name: string;
  is_vat_payer: boolean;
}

const Business = () => {
  const navigate = useNavigate();
  const { activeBusinessProfileId, setActiveBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { dashboardExpenses, expenses: allExpenses, loading } = useExpenseFetch();
  const { addExpense, updateExpense, deleteExpense } = useExpenseCRUD();
  const { totalReceivable, totalPayable } = useBusinessDebts();

  const [activeTab, setActiveTab] = useState<BusinessTab>('dashboard');
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  // Redirect if no business profile selected
  useEffect(() => {
    if (!activeBusinessProfileId) {
      navigate('/');
    }
  }, [activeBusinessProfileId, navigate]);

  // Fetch active profile info
  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    supabase
      .from('business_profiles')
      .select('id, company_name, is_vat_payer')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [activeBusinessProfileId, user]);

  const handleBackToPersonal = () => {
    setActiveBusinessProfileId(null);
    navigate('/');
  };

  const handleAddExpense = async (expenseData: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    await addExpense(expenseData);
    setAddExpenseOpen(false);
  };

  const handleEditExpense = async (updatedExpense: Expense) => {
    await editExpense(updatedExpense.id, updatedExpense);
  };

  if (!activeBusinessProfileId) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={handleBackToPersonal} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <User className="w-3 h-3" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">{profile?.company_name || 'Tvrtka'}</h1>
              <p className="text-[10px] text-muted-foreground">Poslovni način</p>
            </div>
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
        {activeTab === 'transactions' && (
          <BusinessTransactions
            expenses={dashboardExpenses}
            onAddClick={() => setAddExpenseOpen(true)}
            onEditExpense={handleEditExpense}
            onDeleteExpense={deleteExpense}
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

      {/* Add Expense Dialog */}
      <AddExpenseDialog
        onAdd={handleAddExpense}
      />

      <BusinessBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Business;
