import { useExpenses } from '@/hooks/useExpenses';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { useRecurringMatcher, RecurringMatch } from '@/hooks/useRecurringMatcher';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useInstallments } from '@/hooks/useInstallments';
import { useBudgets } from '@/hooks/useBudgets';
import { useProjects } from '@/hooks/useProjects';
import { useAppState } from '@/contexts/AppStateContext';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { useBulkActions } from '@/hooks/useBulkActions';
import { supabase } from '@/integrations/supabase/client';
import { FilterState, defaultFilters, applyFilters } from '@/components/TransactionFilters';
import { BusinessTab } from '@/components/business/BusinessBottomNav';
import { BusinessModeView } from '@/components/home/BusinessModeView';
import { PersonalModeView } from '@/components/home/PersonalModeView';
import { Expense } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { Loader2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useBackButton } from '@/hooks/useBackButton';
import { useTranslation } from 'react-i18next';
import { showSuccess } from '@/hooks/useStatusFeedback';

const Index = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading, signOut } = useAuth();
  const { storageMode } = useStorage();
  const { formatAmount, currency, multiCurrencyEnabled } = useCurrency();
  const { convert } = useExchangeRates(multiCurrencyEnabled);
  const { displayName, aiAssistantEnabled, simpleModeEnabled, activeBusinessProfileId, setActiveBusinessProfileId, businessModeEnabled, setBusinessModeEnabled } = useAppState();
  const { totalReceivable, totalPayable } = useBusinessDebts();
  const isBusinessMode = businessModeEnabled && !!activeBusinessProfileId;
  const [businessTab, setBusinessTab] = useState<BusinessTab>('dashboard');
  const [businessProfile, setBusinessProfile] = useState<{ id: string; company_name: string; is_vat_payer: boolean; industry_type?: string; enabled_modules?: string[]; theme_color?: string } | null>(null);

  // Load business profile data
  useEffect(() => {
    if (!activeBusinessProfileId || !user) { setBusinessProfile(null); return; }
    supabase
      .from('business_profiles')
      .select('id, company_name, is_vat_payer, industry_type, enabled_modules, theme_color')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => { if (data) setBusinessProfile(data as any); });
  }, [activeBusinessProfileId, user]);

  // Back button for business tabs
  useBackButton(isBusinessMode && businessTab !== 'dashboard', () => setBusinessTab('dashboard'));
  const navigate = useNavigate();
  const location = useLocation();

  // Dialog open states
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Expense | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [dashboardFilters, setDashboardFilters] = useState<FilterState>(defaultFilters);
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<CustomPaymentSource | null>(null);
  const [paymentSourceDialogOpen, setPaymentSourceDialogOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [assistantDialogOpen, setAssistantDialogOpen] = useState(false);
  const [recurringPanelOpen, setRecurringPanelOpen] = useState(false);
  const [recurringMatches, setRecurringMatches] = useState<RecurringMatch[]>([]);
  const [recurringMatchDialogOpen, setRecurringMatchDialogOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  // Back button support for all dialogs
  useBackButton(incomeDialogOpen, () => setIncomeDialogOpen(false));
  useBackButton(expenseDialogOpen, () => setExpenseDialogOpen(false));
  useBackButton(transferDialogOpen, () => setTransferDialogOpen(false));
  useBackButton(detailDialogOpen, () => setDetailDialogOpen(false));
  useBackButton(editDialogOpen, () => setEditDialogOpen(false));
  useBackButton(paymentSourceDialogOpen, () => setPaymentSourceDialogOpen(false));
  useBackButton(assistantDialogOpen, () => setAssistantDialogOpen(false));
  useBackButton(recurringPanelOpen, () => setRecurringPanelOpen(false));
  useBackButton(recurringMatchDialogOpen, () => setRecurringMatchDialogOpen(false));

  const { recurringTransactions, processDueTransactions, updateRecurring, refetch: refetchRecurring } = useRecurringTransactions();
  const { findMatches } = useRecurringMatcher();

  // Load welcome animation flag
  useEffect(() => {
    const shouldShowWelcome = localStorage.getItem('show_welcome_animation');
    if (shouldShowWelcome === 'true') {
      setShowWelcome(true);
      localStorage.removeItem('show_welcome_animation');
    }
    const localName = localStorage.getItem('user_display_name');
    if (!localName && user) {
      supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.display_name) {
            localStorage.setItem('user_display_name', data.display_name);
          }
        });
    }
  }, [user]);

  // Helper to calculate next due date for matched recurring transactions
  const calculateNextDueDateForMatch = useCallback((currentDate: Date, frequency: string, dayOfMonth: number | null): Date => {
    const next = new Date(currentDate);
    switch (frequency) {
      case 'daily': next.setDate(next.getDate() + 1); break;
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'biweekly': next.setDate(next.getDate() + 14); break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        if (dayOfMonth) {
          const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(Math.min(dayOfMonth, maxDay));
        }
        break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    }
    return next;
  }, []);

  const { ownedPaymentSources: customPaymentSources, refetch: refetchPaymentSources } = useCustomPaymentSources();
  const { customCategories } = useCustomCategories();
  const { plans: installmentPlans } = useInstallments();
  const { budgets: budgetsWithStats } = useBudgets();
  const { projects } = useProjects();

  const contextLookup = useMemo(() => ({
    budgets: budgetsWithStats.map(b => ({ id: b.id, name: b.name, icon: b.icon, color: b.color })),
    projects: projects.map(p => ({ id: p.id, name: p.name, icon: p.icon, color: p.color })),
    customPaymentSources: customPaymentSources.map(s => ({ id: s.id, name: s.name, icon: s.icon, color: s.color, cards: s.cards?.map(c => ({ id: c.id, last_four_digits: c.last_four_digits })) })),
    customCategories: customCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color })),
  }), [budgetsWithStats, projects, customPaymentSources, customCategories]);

  const {
    expenses,
    allExpenses,
    loading: expensesLoading,
    addExpense,
    updateExpense,
    bulkUpdateExpenses,
    deleteExpense,
    importFromCSV,
    findDuplicates,
    checkDuplicate,
    totalExpenses,
    totalIncome,
    totalTransfers,
    monthlyTransfers,
    monthlyTransferCount,
    balance,
    expensesByCategory,
    isLocalMode,
    refetch,
    prevMonthIncome,
    prevMonthExpenses,
    curMonthIncome,
    curMonthExpenses,
  } = useExpenses({ onBalanceUpdated: refetchPaymentSources });

  // Handle notification click → open transaction detail
  useEffect(() => {
    const state = location.state as { openExpenseId?: string } | null;
    if (state?.openExpenseId && allExpenses.length > 0) {
      const expense = allExpenses.find(e => e.id === state.openExpenseId);
      if (expense) {
        setSelectedTransaction(expense);
        setDetailDialogOpen(true);
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, allExpenses]);

  // Auto-process due recurring transactions on load
  useEffect(() => {
    if (recurringTransactions.length > 0) {
      processDueTransactions(addExpense);
    }
  }, [recurringTransactions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const allTransfers = useMemo(() =>
    expenses.filter(e => e.type === 'transfer').sort((a, b) => b.date.getTime() - a.date.getTime()),
    [expenses]
  );

  const allCards = useMemo(() =>
    customPaymentSources.flatMap(source => source.cards || []),
    [customPaymentSources]
  );

  const filteredDashboardExpenses = useMemo(() =>
    applyFilters(expenses, dashboardFilters, user?.id)
      .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [expenses, dashboardFilters, user?.id]
  );

  const monthlyTransactionsCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return expenses.filter(e => e.date >= start && e.date <= end).length;
  }, [expenses]);

  const budgetsForAssistant = useMemo(() =>
    budgetsWithStats.map(b => ({
      name: b.name,
      total_amount: b.total_amount,
      spent: b.spent,
      period_type: b.period_type,
      is_active: b.is_active ?? true,
      categories: b.categories?.map(c => ({
        category: c.category,
        limit_amount: c.limit_amount,
        spent: c.spent
      }))
    })),
    [budgetsWithStats]
  );

  const projectsForAssistant = useMemo(() =>
    projects.map(p => {
      const projectExpenses = allExpenses.filter(
        e => e.project_id === p.id && e.type === 'expense' && e.status === 'approved'
      );
      const spent = projectExpenses.reduce((sum, e) => sum + e.amount, 0);
      return { name: p.name, total_budget: p.total_budget, spent, status: p.status, description: p.description, milestones: [] };
    }),
    [projects, allExpenses]
  );

  const netWorth = useMemo(() => {
    const totalAccountBalances = customPaymentSources.reduce((sum, source) => {
      const bal = source.balance || 0;
      if (multiCurrencyEnabled && source.currency && source.currency !== currency.code) {
        return sum + convert(bal, source.currency, currency.code);
      }
      return sum + bal;
    }, 0);
    const remainingObligations = installmentPlans.reduce((sum, plan) => sum + (plan.remainingAmount || 0), 0);
    return totalAccountBalances - remainingObligations;
  }, [customPaymentSources, installmentPlans, multiCurrencyEnabled, currency.code, convert]);

  useAutoBackup();

  // Bulk actions hook
  const {
    selectedTransactionIds,
    setSelectedTransactionIds,
    handleToggleSelect,
    handleSelectAll,
    handleClearSelection,
    handleBulkCategoryChange,
    handleBulkPaymentSourceChange,
    handleBulkDelete,
  } = useBulkActions({
    filteredExpenses: filteredDashboardExpenses,
    bulkUpdateExpenses,
    deleteExpense,
  });

  // Clear selection when filters change
  useEffect(() => {
    setSelectedTransactionIds(new Set());
  }, [dashboardFilters, setSelectedTransactionIds]);

  // Wrapper: check for recurring matches after adding a transaction
  const addExpenseWithRecurringCheck = useCallback(async (expense: any) => {
    await addExpense(expense);
    if (recurringTransactions.length > 0 && !isBusinessMode) {
      try {
        const matches = await findMatches([{
          description: expense.description || '',
          amount: expense.amount,
          type: expense.type || 'expense',
          date: expense.date instanceof Date ? expense.date.toISOString().split('T')[0] : expense.date,
        }], recurringTransactions);
        if (matches.length > 0) {
          setRecurringMatches(matches);
          setRecurringMatchDialogOpen(true);
        }
      } catch (e) { console.error('Recurring match check failed:', e); }
    }
  }, [addExpense, recurringTransactions, isBusinessMode, findMatches]);

  // Wrapper: check for recurring matches after bulk import
  const importWithRecurringCheck = useCallback(async (txs: any[]) => {
    await importFromCSV(txs);
    if (recurringTransactions.length > 0 && !isBusinessMode && txs.length > 0) {
      try {
        const matches = await findMatches(txs.map(e => ({
          description: e.description || '',
          amount: e.amount,
          type: e.type || 'expense',
          date: e.date instanceof Date ? e.date.toISOString().split('T')[0] : (e.date || new Date().toISOString().split('T')[0]),
        })), recurringTransactions);
        if (matches.length > 0) {
          setRecurringMatches(matches);
          setRecurringMatchDialogOpen(true);
        }
      } catch (e) { console.error('Recurring match after import failed:', e); }
    }
  }, [importFromCSV, recurringTransactions, isBusinessMode, findMatches]);

  // Handle replacing auto-generated recurring transactions with bank statement data
  const handleReplaceAutoGen = useCallback(async (replacements: { tx: any; existingId: string }[]) => {
    for (const { tx, existingId } of replacements) {
      const existing = allExpenses.find(e => e.id === existingId);
      if (!existing) continue;
      const updated: Expense = {
        ...existing,
        description: tx.description || existing.description,
        date: tx.date instanceof Date ? tx.date : new Date(tx.date),
        merchant_name: tx.merchant_name || existing.merchant_name,
        payment_source: tx.payment_source || existing.payment_source,
        note: existing.note ? existing.note.replace('(auto)', '(bankovni izvod)') : '(bankovni izvod)',
      };
      await updateExpense(updated);
    }
  }, [allExpenses, updateExpense]);


  const handleRecurringMatchConfirm = useCallback(async (selectedIds: string[]) => {
    for (const id of selectedIds) {
      const rec = recurringTransactions.find(r => r.id === id);
      if (!rec) continue;
      const nextDate = calculateNextDueDateForMatch(new Date(rec.next_due_date), rec.frequency, rec.day_of_month);
      await updateRecurring(id, {
        next_due_date: nextDate.toISOString().split('T')[0],
        last_generated_date: new Date().toISOString().split('T')[0],
      });
    }
    showSuccess(t('toasts.obligationsMarkedPaid', { count: selectedIds.length }));
    refetchRecurring();
  }, [recurringTransactions, updateRecurring, refetchRecurring, calculateNextDueDateForMatch, t]);

  const handlePaymentSourceClick = useCallback((source: CustomPaymentSource) => {
    setSelectedPaymentSource(source);
    setPaymentSourceDialogOpen(true);
  }, []);

  const handleTransactionClick = useCallback((expense: Expense) => {
    setSelectedTransaction(expense);
    setDetailDialogOpen(true);
  }, []);

  const handleEditFromDetail = useCallback((expense: Expense) => {
    setSelectedTransaction(expense);
    setEditDialogOpen(true);
  }, []);

  const handleShowMore = useCallback(() => {
    setVisibleCount(prev => prev + 50);
  }, []);

  const handleDashboardFiltersChange = useCallback((f: FilterState) => {
    setDashboardFilters(f);
    setVisibleCount(50);
  }, []);

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate, storageMode]);

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && storageMode === 'cloud') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Shared dialog props
  const sharedDialogProps = {
    incomeDialogOpen,
    onIncomeDialogChange: setIncomeDialogOpen,
    expenseDialogOpen,
    onExpenseDialogChange: setExpenseDialogOpen,
    transferDialogOpen,
    onTransferDialogChange: setTransferDialogOpen,
    selectedTransaction,
    detailDialogOpen,
    onDetailDialogChange: (open: boolean) => {
      setDetailDialogOpen(open);
      if (!open) setSelectedTransaction(null);
    },
    onEditFromDetail: handleEditFromDetail,
    editDialogOpen,
    onEditDialogChange: setEditDialogOpen,
    paymentSourceDialogOpen,
    onPaymentSourceDialogChange: setPaymentSourceDialogOpen,
    selectedPaymentSource,
    onPaymentSourceClick: handlePaymentSourceClick,
    onTransactionClick: handleTransactionClick,
    recurringPanelOpen,
    onRecurringPanelClose: () => setRecurringPanelOpen(false),
    onRecurringPanelOpen: () => setRecurringPanelOpen(true),
    recurringMatchDialogOpen,
    onRecurringMatchDialogChange: setRecurringMatchDialogOpen,
    recurringMatches,
    onRecurringMatchConfirm: handleRecurringMatchConfirm,
    transactionsOpen,
    onTransactionsOpenChange: setTransactionsOpen,
    // Data
    expenses,
    allExpenses,
    expensesLoading,
    totalIncome,
    totalExpenses,
    totalTransfers,
    monthlyTransfers,
    monthlyTransferCount,
    allTransfers,
    allCards,
    // Actions
    onUpdateExpense: updateExpense,
    onDeleteExpense: deleteExpense,
    importFromCSV: importWithRecurringCheck,
    onReplaceAutoGen: handleReplaceAutoGen,
    findDuplicates,
    // Bulk
    dashboardFilters,
    onDashboardFiltersChange: handleDashboardFiltersChange,
    filteredDashboardExpenses,
    monthlyTransactionsCount,
    visibleCount,
    onShowMore: handleShowMore,
    selectedTransactionIds,
    onToggleSelect: handleToggleSelect,
    onSelectAll: handleSelectAll,
    onClearSelection: handleClearSelection,
    onBulkCategoryChange: handleBulkCategoryChange,
    onBulkPaymentSourceChange: handleBulkPaymentSourceChange,
    onBulkDelete: handleBulkDelete,
    contextLookup,
    // Sources
    customPaymentSources,
    multiCurrencyEnabled,
    currencyCode: currency.code,
    convert,
    netWorth,
    isLocalMode,
    expensesByCategory,
    activeRecurringCount: recurringTransactions.filter(r => r.is_active).length,
    prevMonthIncome,
    prevMonthExpenses,
    curMonthIncome,
    curMonthExpenses,
  };

  if (isBusinessMode) {
    return (
      <BusinessModeView
        {...sharedDialogProps}
        businessTab={businessTab}
        onBusinessTabChange={setBusinessTab}
        businessProfile={businessProfile}
        displayName={displayName}
        onBackToPersonal={() => {
          setBusinessModeEnabled(false);
          setBusinessTab('dashboard');
        }}
        onAddExpense={addExpenseWithRecurringCheck}
        bulkUpdateExpenses={bulkUpdateExpenses}
        checkDuplicate={checkDuplicate}
        refetch={refetch}
        totalReceivable={totalReceivable}
        totalPayable={totalPayable}
        formatAmount={formatAmount}
      />
    );
  }

  return (
    <PersonalModeView
      {...sharedDialogProps}
      displayName={displayName}
      simpleModeEnabled={simpleModeEnabled}
      aiAssistantEnabled={aiAssistantEnabled}
      onAddExpense={addExpenseWithRecurringCheck}
      bulkUpdateExpenses={bulkUpdateExpenses}
      checkDuplicate={checkDuplicate}
      refetch={refetch}
      balance={balance}
      budgetsCount={budgetsWithStats.length}
      budgetsForAssistant={budgetsForAssistant}
      projectsForAssistant={projectsForAssistant}
      businessProfileName={businessProfile?.company_name}
      showWelcome={showWelcome}
      onWelcomeComplete={() => setShowWelcome(false)}
      assistantDialogOpen={assistantDialogOpen}
      onAssistantDialogChange={setAssistantDialogOpen}
    />
  );
};

export default Index;
