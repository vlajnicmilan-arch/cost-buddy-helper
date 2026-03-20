import { useExpenses } from '@/hooks/useExpenses';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { useRecurringMatcher, RecurringMatch } from '@/hooks/useRecurringMatcher';
import { RecurringMatchDialog } from '@/components/recurring/RecurringMatchDialog';
import { RecurringTransactionsPanel } from '@/components/recurring/RecurringTransactionsPanel';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useInstallments } from '@/hooks/useInstallments';
import { useBudgets } from '@/hooks/useBudgets';
import { useProjects } from '@/hooks/useProjects';
import { useAppState } from '@/contexts/AppStateContext';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { supabase } from '@/integrations/supabase/client';
import { TransactionItem } from '@/components/TransactionItem';
import { TransactionListDialog } from '@/components/TransactionListDialog';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TransferListDialog } from '@/components/TransferListDialog';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { PaymentSourceTransactionsDialog } from '@/components/PaymentSourceTransactionsDialog';
import { AIInsightBubble } from '@/components/AIInsightBubble';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from '@/components/TransactionFilters';
import { BottomNav } from '@/components/BottomNav';
import { BusinessBottomNav, BusinessTab } from '@/components/business/BusinessBottomNav';
import { BusinessDashboard } from '@/components/business/BusinessDashboard';
import { BusinessTransactions } from '@/components/business/BusinessTransactions';
import { BusinessReports } from '@/components/business/BusinessReports';
import { BusinessMore } from '@/components/business/BusinessMore';
import { BusinessWallet } from '@/components/business/BusinessWallet';
import { BusinessProjects } from '@/components/business/BusinessProjects';
import { Expense, Category } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { Loader2, Smartphone, ChevronDown, ArrowRight, Receipt, ArrowLeft, Building2, FileSpreadsheet } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useBackButton } from '@/hooks/useBackButton';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { WelcomeConfetti } from '@/components/WelcomeConfetti';
import { APP_VERSION } from '@/lib/version';

// Extracted components
import { HomeHeader } from '@/components/home/HomeHeader';
import { PaymentSourcesSection } from '@/components/home/PaymentSourcesSection';
import { SummarySection } from '@/components/home/SummarySection';
import { QuickLinksSection } from '@/components/home/QuickLinksSection';
import { FinancialAssistantDialog } from '@/components/FinancialAssistantDialog';
import { CashflowForecast } from '@/components/CashflowForecast';
import { SavingsGoalsSection } from '@/components/savings';
import { ReportsDialog } from '@/components/reports/ReportsDialog';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { CSVImportDialog } from '@/components/CSVImportDialog';
import { WelcomeChecklist } from '@/components/WelcomeChecklist';

const Index = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading, signOut } = useAuth();
  const { storageMode } = useStorage();
  const { formatAmount, currency, multiCurrencyEnabled } = useCurrency();
  const { convert } = useExchangeRates(multiCurrencyEnabled);
  const { displayName, aiAssistantEnabled, simpleModeEnabled, activeBusinessProfileId, setActiveBusinessProfileId } = useAppState();
  const { totalReceivable, totalPayable } = useBusinessDebts();
  const isBusinessMode = !!activeBusinessProfileId;
  const [businessTab, setBusinessTab] = useState<BusinessTab>('dashboard');
  const [businessProfile, setBusinessProfile] = useState<{ id: string; company_name: string; is_vat_payer: boolean; industry_type?: string; enabled_modules?: string[]; theme_color?: string } | null>(null);
  const [businessImportOpen, setBusinessImportOpen] = useState(false);

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
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [showWelcome, setShowWelcome] = useState(false);
  const [assistantDialogOpen, setAssistantDialogOpen] = useState(false);
  const [recurringPanelOpen, setRecurringPanelOpen] = useState(false);
  const [recurringMatches, setRecurringMatches] = useState<RecurringMatch[]>([]);
  const [recurringMatchDialogOpen, setRecurringMatchDialogOpen] = useState(false);

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

  // Load welcome animation flag; displayName now comes from AppStateContext
  useEffect(() => {
    const shouldShowWelcome = localStorage.getItem('show_welcome_animation');
    if (shouldShowWelcome === 'true') {
      setShowWelcome(true);
      localStorage.removeItem('show_welcome_animation');
    }

    // If no local name yet but user is loaded, load from DB and sync to context
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
  const { plans: installmentPlans } = useInstallments();
  const { budgets: budgetsWithStats } = useBudgets();
  const { projects } = useProjects();

  const contextLookup = useMemo(() => ({
    budgets: budgetsWithStats.map(b => ({ id: b.id, name: b.name, icon: b.icon, color: b.color })),
    projects: projects.map(p => ({ id: p.id, name: p.name, icon: p.icon, color: p.color })),
  }), [budgetsWithStats, projects]);

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
    refetch
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

  // Confirm matched recurring → advance next_due_date
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
    toast.success(t('toasts.obligationsMarkedPaid', { count: selectedIds.length }));
    refetchRecurring();
  }, [recurringTransactions, updateRecurring, refetchRecurring, calculateNextDueDateForMatch]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedTransactionIds(new Set());
  }, [dashboardFilters]);

  // Bulk selection handlers
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTransactionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedTransactionIds(new Set(filteredDashboardExpenses.map(e => e.id)));
  }, [filteredDashboardExpenses]);

  const handleClearSelection = useCallback(() => {
    setSelectedTransactionIds(new Set());
  }, []);

  const handleBulkCategoryChange = useCallback(async (category: Category) => {
    const selectedExpenses = filteredDashboardExpenses.filter(e => selectedTransactionIds.has(e.id));
    await bulkUpdateExpenses(selectedExpenses.map(e => ({ ...e, category })));
    setSelectedTransactionIds(new Set());
    toast.success(t('transactions.bulkCategoryChanged', { count: selectedExpenses.length }));
  }, [filteredDashboardExpenses, selectedTransactionIds, bulkUpdateExpenses, t]);

  const handleBulkPaymentSourceChange = useCallback(async (paymentSource: string) => {
    const selectedExpenses = filteredDashboardExpenses.filter(e => selectedTransactionIds.has(e.id));
    await bulkUpdateExpenses(selectedExpenses.map(e => ({ ...e, paymentSource })));
    setSelectedTransactionIds(new Set());
    toast.success(t('transactions.bulkSourceChanged', { count: selectedExpenses.length }));
  }, [filteredDashboardExpenses, selectedTransactionIds, bulkUpdateExpenses, t]);

  const handleBulkDelete = useCallback(async () => {
    const idsToDelete = Array.from(selectedTransactionIds);
    await Promise.all(idsToDelete.map(id => deleteExpense(id)));
    setSelectedTransactionIds(new Set());
    toast.success(t('transactions.bulkDeleted', { count: idsToDelete.length }));
  }, [selectedTransactionIds, deleteExpense, t]);

  const handleSignOut = async () => {
    if (isLocalMode) {
      navigate('/setup');
    } else {
      try {
        await signOut();
      } catch (error) {
        console.error('Sign out error:', error);
      } finally {
        navigate('/auth');
      }
    }
  };

  useEffect(() => {
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth', { replace: true });
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

  // ── Business Mode Rendering ──
  if (isBusinessMode) {
    const handleBackToPersonal = () => {
      setActiveBusinessProfileId(null);
      setBusinessTab('dashboard');
    };

    const handleEditExpense = async (updatedExpense: Expense) => {
      await updateExpense(updatedExpense);
    };

    return (
      <div className={`business-theme-${businessProfile?.theme_color || 'ocean-blue'} min-h-dvh bg-background pb-20`}>
        {/* Accent bar + Business header */}
        <div className="h-1 bg-primary rounded-b-full" />
        <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-4">
            <button
              onClick={handleBackToPersonal}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/15 border-2 border-primary/30 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-3xl font-bold text-foreground tracking-tight truncate">
                {displayName ? t('common.greeting', 'Bok, {{name}}!').replace('{{name}}', displayName) : 'V&M Balance'}
              </h1>
              <p className="text-xs sm:text-sm text-primary/80 font-medium truncate">
                {businessProfile?.company_name || 'Tvrtka'}
              </p>
            </div>
          </div>
        </div>

        {/* Business Content */}
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4">
          {businessTab === 'dashboard' && (
            <>
              {/* Action buttons (no BulkEdit for business) */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <ReportsDialog expenses={allExpenses} />
                {importFromCSV && (
                  <>
                    <Button 
                      variant="outline" 
                      className="gap-2 rounded-xl"
                      onClick={() => setBusinessImportOpen(true)}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      {t('import.title', 'Uvoz izvoda')}
                    </Button>
                    <CSVImportDialog
                      onImport={importFromCSV}
                      findDuplicates={findDuplicates}
                      existingExpenses={allExpenses}
                      externalOpen={businessImportOpen}
                      onExternalOpenChange={setBusinessImportOpen}
                    />
                  </>
                )}
                <AddExpenseDialog onAdd={addExpenseWithRecurringCheck} checkDuplicate={checkDuplicate} />
              </div>

              {/* Payment Sources */}
              <PaymentSourcesSection
                customPaymentSources={customPaymentSources}
                onSourceClick={(source) => {
                  setSelectedPaymentSource(source);
                  setPaymentSourceDialogOpen(true);
                }}
              />

              {/* Summary Cards */}
              <SummarySection
                balance={customPaymentSources.reduce((sum, s) => {
                  const bal = s.balance || 0;
                  if (multiCurrencyEnabled && s.currency && s.currency !== currency.code) {
                    return sum + convert(bal, s.currency, currency.code);
                  }
                  return sum + bal;
                }, 0)}
                netWorth={netWorth}
                totalIncome={totalIncome}
                totalExpenses={totalExpenses}
                totalTransfers={totalTransfers}
                monthlyTransfers={monthlyTransfers}
                monthlyTransferCount={monthlyTransferCount}
                allTransfers={allTransfers}
                recurringCount={recurringTransactions.filter(r => r.is_active).length}
                isLocalMode={isLocalMode}
                simpleModeEnabled={false}
                onIncomeClick={() => setIncomeDialogOpen(true)}
                onExpenseClick={() => setExpenseDialogOpen(true)}
                onTransferClick={() => setTransferDialogOpen(true)}
                onRecurringClick={() => setRecurringPanelOpen(true)}
              />

              {/* Receivables & Payables */}
              {(totalReceivable > 0 || totalPayable > 0) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-2xl border border-border/50 text-center" style={{ background: 'linear-gradient(135deg, hsl(var(--income) / 0.06) 0%, transparent 100%)' }}>
                    <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.receivables', 'Potraživanja')}</p>
                    <p className="text-sm font-bold text-income">{formatAmount(totalReceivable)}</p>
                  </div>
                  <div className="p-3 rounded-2xl border border-border/50 text-center" style={{ background: 'linear-gradient(135deg, hsl(var(--destructive) / 0.06) 0%, transparent 100%)' }}>
                    <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.payables', 'Dugovanja')}</p>
                    <p className="text-sm font-bold text-destructive">{formatAmount(totalPayable)}</p>
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <Collapsible open={transactionsOpen} onOpenChange={setTransactionsOpen}>
                <div className={`glass-card rounded-2xl animate-fade-in transition-all duration-200 ${transactionsOpen ? 'p-6' : 'p-4'}`}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between hover:opacity-80 transition-opacity">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-primary" />
                        {t('transactions.recent', 'Nedavno')}
                      </h2>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {filteredDashboardExpenses.length !== expenses.length
                            ? t('transactions.transactionsCountFiltered', { filtered: filteredDashboardExpenses.length, total: expenses.length })
                            : t('transactions.transactionsCount', { count: expenses.length })}
                        </span>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${transactionsOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-4">
                    <TransactionFilters
                      filters={dashboardFilters}
                      onFiltersChange={setDashboardFilters}
                      showCardFilter={allCards.length > 0}
                      showScopeFilter={false}
                      cards={allCards}
                    />
                    <BulkActionsToolbar
                      selectedCount={selectedTransactionIds.size}
                      onClearSelection={handleClearSelection}
                      onSelectAll={handleSelectAll}
                      totalCount={filteredDashboardExpenses.length}
                      onBulkCategoryChange={handleBulkCategoryChange}
                      onBulkPaymentSourceChange={handleBulkPaymentSourceChange}
                      onBulkDelete={handleBulkDelete}
                    />
                    {expensesLoading ? (
                      <div className="py-12 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredDashboardExpenses.length === 0 ? (
                      <EmptyState
                        variant="transactions"
                        title={expenses.length === 0 ? t('transactions.noTransactions') : t('transactions.noResults', 'Nema rezultata za odabrane filtere')}
                        description={expenses.length === 0 ? t('transactions.addFirstTransaction') : undefined}
                        compact
                      />
                    ) : (
                      <div className="space-y-1">
                        {filteredDashboardExpenses.slice(0, 50).map((expense) => (
                          <div key={expense.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedTransactionIds.has(expense.id)}
                              onCheckedChange={() => handleToggleSelect(expense.id)}
                              className="shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <TransactionItem
                                expense={expense}
                                onDelete={deleteExpense}
                                onClick={(e) => {
                                  if (selectedTransactionIds.size === 0) {
                                    setSelectedTransaction(e);
                                    setDetailDialogOpen(true);
                                  } else {
                                    handleToggleSelect(e.id);
                                  }
                                }}
                                contextLookup={contextLookup}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* Quick Links: Projects & Budgets */}
              <div className="mt-6 space-y-4">
                <QuickLinksSection
                  simpleModeEnabled={false}
                  isLocalMode={false}
                  expensesByCategory={expensesByCategory}
                  totalExpenses={totalExpenses}
                  expenses={expenses}
                  onUpdateExpense={updateExpense}
                  onDeleteExpense={deleteExpense}
                />
              </div>
            </>
          )}
          {businessTab === 'wallet' && <BusinessWallet />}
          {businessTab === 'transactions' && (
            <BusinessTransactions
              expenses={expenses}
              onAddClick={() => {}}
              onEditExpense={handleEditExpense}
              onDeleteExpense={deleteExpense}
              onImportCSV={importFromCSV}
              findDuplicates={findDuplicates}
              existingExpenses={allExpenses}
            />
          )}
          {businessTab === 'projects' && (
            <BusinessProjects onRefreshExpenses={refetch} />
          )}
          {businessTab === 'reports' && (
            <BusinessReports
              expenses={expenses}
              companyName={businessProfile?.company_name || 'Tvrtka'}
            />
          )}
          {businessTab === 'more' && <BusinessMore expenses={expenses} />}
        </div>

        {/* Dialogs for business mode */}
        <TransactionListDialog
          open={incomeDialogOpen}
          onOpenChange={setIncomeDialogOpen}
          type="income"
          expenses={expenses}
          onUpdate={updateExpense}
          onDelete={deleteExpense}
          total={totalIncome}
        />
        <TransactionListDialog
          open={expenseDialogOpen}
          onOpenChange={setExpenseDialogOpen}
          type="expense"
          expenses={expenses}
          onUpdate={updateExpense}
          onDelete={deleteExpense}
          total={totalExpenses}
        />
        <TransferListDialog
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          transfers={allTransfers}
          totalAmount={totalTransfers}
        />
        <TransactionDetailDialog
          expense={selectedTransaction}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onEdit={(expense) => {
            setSelectedTransaction(expense);
            setEditDialogOpen(true);
          }}
          onDelete={deleteExpense}
        />
        <EditTransactionDialog
          expense={selectedTransaction}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSave={updateExpense}
        />
        <PaymentSourceTransactionsDialog
          open={paymentSourceDialogOpen}
          onOpenChange={setPaymentSourceDialogOpen}
          paymentSource={selectedPaymentSource}
          expenses={allExpenses}
          onUpdate={updateExpense}
          onDelete={deleteExpense}
          onImportCSV={importFromCSV}
          findDuplicates={findDuplicates}
        />

        {recurringPanelOpen && (
          <RecurringTransactionsPanel onClose={() => setRecurringPanelOpen(false)} />
        )}

        <BusinessBottomNav activeTab={businessTab} onTabChange={setBusinessTab} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background overflow-x-hidden pb-20">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">

        {/* ── Financial Assistant Dialog (portal-rendered, outside header to avoid click conflicts) ── */}
        {!isLocalMode && aiAssistantEnabled && !simpleModeEnabled && (
          <FinancialAssistantDialog
            expenses={expenses}
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            balance={balance}
            paymentSources={customPaymentSources}
            budgets={budgetsForAssistant}
            projects={projectsForAssistant}
            open={assistantDialogOpen}
            onOpenChange={setAssistantDialogOpen}
            hideTrigger
          />
        )}

        {/* ── Header ── */}
        <HomeHeader
          displayName={displayName}
          isLocalMode={isLocalMode}
          simpleModeEnabled={simpleModeEnabled}
          expenses={expenses}
          reportsExpenses={allExpenses}
          onAddExpense={addExpenseWithRecurringCheck}
          onCheckDuplicate={checkDuplicate}
          onBulkUpdateExpenses={bulkUpdateExpenses}
          onImportCSV={importWithRecurringCheck}
          findDuplicates={findDuplicates}
          existingExpenses={allExpenses}
          onRefetch={refetch}
        />

        {/* Local Mode Banner */}
        {isLocalMode && (
          <div className="mb-6 p-4 bg-muted/50 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t('common.localMode')}</p>
                <p className="text-xs text-muted-foreground">{t('common.dataStaysLocal')}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/setup')} className="rounded-lg text-xs">
              {t('common.switchToCloud')}
            </Button>
          </div>
        )}

        {/* ── Welcome Checklist for new users ── */}
        <WelcomeChecklist
          hasPaymentSources={customPaymentSources.length > 0}
          hasTransactions={expenses.length > 0}
          hasBudgets={budgetsWithStats.length > 0}
          onAddPaymentSource={() => navigate('/wallet')}
          onAddTransaction={() => {
            // Trigger add expense dialog
            const addBtn = document.querySelector('[data-tutorial="add-buttons"] button:last-child') as HTMLButtonElement;
            addBtn?.click();
          }}
          onAddBudget={() => navigate('/budgets')}
        />

        {/* ── Payment Sources ── */}
        <PaymentSourcesSection
          customPaymentSources={customPaymentSources}
          onSourceClick={(source) => {
            setSelectedPaymentSource(source);
            setPaymentSourceDialogOpen(true);
          }}
        />

        {/* ── Summary Cards + Transfers + Recurring ── */}
        <SummarySection
          balance={customPaymentSources.reduce((sum, s) => {
            const bal = s.balance || 0;
            if (multiCurrencyEnabled && s.currency && s.currency !== currency.code) {
              return sum + convert(bal, s.currency, currency.code);
            }
            return sum + bal;
          }, 0)}
          netWorth={netWorth}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          totalTransfers={totalTransfers}
          monthlyTransfers={monthlyTransfers}
          monthlyTransferCount={monthlyTransferCount}
          allTransfers={allTransfers}
          recurringCount={recurringTransactions.filter(r => r.is_active).length}
          isLocalMode={isLocalMode}
          simpleModeEnabled={simpleModeEnabled}
          onIncomeClick={() => setIncomeDialogOpen(true)}
          onExpenseClick={() => setExpenseDialogOpen(true)}
          onTransferClick={() => setTransferDialogOpen(true)}
          onRecurringClick={() => setRecurringPanelOpen(true)}
        />

        {/* ── Cashflow Forecast (collapsible, always visible) ── */}
        <Collapsible className="group">
          <div className="glass-card rounded-2xl animate-fade-in p-4">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between hover:opacity-80 transition-opacity">
                <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  {t('dashboard.cashflow.title')}
                </h3>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3">
                <CashflowForecast />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>


        {/* ── Main Content Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Transactions */}
          <Collapsible open={transactionsOpen} onOpenChange={setTransactionsOpen} className="lg:col-span-2">
            <div className={`glass-card rounded-2xl animate-fade-in transition-all duration-200 ${transactionsOpen ? 'p-6' : 'p-4'}`}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between hover:opacity-80 transition-opacity" data-tutorial="transactions">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" />
                    {t('transactions.recent', 'Nedavno')}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {filteredDashboardExpenses.length !== expenses.length
                        ? t('transactions.transactionsCountFiltered', { filtered: filteredDashboardExpenses.length, total: expenses.length })
                        : t('transactions.transactionsCount', { count: expenses.length })}
                    </span>
                    <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${transactionsOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <TransactionFilters
                  filters={dashboardFilters}
                  onFiltersChange={setDashboardFilters}
                  showCardFilter={allCards.length > 0}
                  showScopeFilter={!isLocalMode}
                  cards={allCards}
                />
                <BulkActionsToolbar
                  selectedCount={selectedTransactionIds.size}
                  onClearSelection={handleClearSelection}
                  onSelectAll={handleSelectAll}
                  totalCount={filteredDashboardExpenses.length}
                  onBulkCategoryChange={handleBulkCategoryChange}
                  onBulkPaymentSourceChange={handleBulkPaymentSourceChange}
                  onBulkDelete={handleBulkDelete}
                />
                {expensesLoading ? (
                  <div className="py-12 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredDashboardExpenses.length === 0 ? (
                  <EmptyState
                    variant="transactions"
                    title={
                      expenses.length === 0
                        ? t('transactions.noTransactions')
                        : t('transactions.noResults', 'Nema rezultata za odabrane filtere')
                    }
                    description={
                      expenses.length === 0
                        ? t('transactions.addFirstTransaction')
                        : undefined
                    }
                    compact
                  />
                ) : (
                  <div className="space-y-1">
                    {filteredDashboardExpenses.slice(0, 50).map((expense) => (
                      <div key={expense.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedTransactionIds.has(expense.id)}
                          onCheckedChange={() => handleToggleSelect(expense.id)}
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <TransactionItem
                            expense={expense}
                            onDelete={deleteExpense}
                            onClick={(e) => {
                              if (selectedTransactionIds.size === 0) {
                                setSelectedTransaction(e);
                                setDetailDialogOpen(true);
                              } else {
                                handleToggleSelect(e.id);
                              }
                            }}
                            contextLookup={contextLookup}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* ── Sidebar: Quick Links + Category Breakdown ── */}
          <QuickLinksSection
            simpleModeEnabled={simpleModeEnabled}
            isLocalMode={isLocalMode}
            expensesByCategory={expensesByCategory}
            totalExpenses={totalExpenses}
            expenses={expenses}
            onUpdateExpense={updateExpense}
            onDeleteExpense={deleteExpense}
          />
        </div>

        {/* Footer */}
        <footer className="mt-8 py-4 text-center border-t border-border/30">
          <p className="text-xs text-muted-foreground">V&M Balance v{APP_VERSION}</p>
        </footer>
      </div>

      {/* ── Dialogs ── */}
      <TransactionListDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        type="income"
        expenses={expenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        total={totalIncome}
      />
      <TransactionListDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        type="expense"
        expenses={expenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        total={totalExpenses}
      />
      <TransferListDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        transfers={allTransfers}
        totalAmount={totalTransfers}
      />
      <TransactionDetailDialog
        expense={selectedTransaction}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={(expense) => {
          setSelectedTransaction(expense);
          setEditDialogOpen(true);
        }}
        onDelete={deleteExpense}
      />
      <EditTransactionDialog
        expense={selectedTransaction}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={updateExpense}
      />
      <PaymentSourceTransactionsDialog
        open={paymentSourceDialogOpen}
        onOpenChange={setPaymentSourceDialogOpen}
        paymentSource={selectedPaymentSource}
        expenses={allExpenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        onImportCSV={importFromCSV}
        findDuplicates={findDuplicates}
      />

      {showWelcome && (
        <WelcomeConfetti
          displayName={displayName || 'Korisnik'}
          onComplete={() => setShowWelcome(false)}
        />
      )}

      {aiAssistantEnabled && !simpleModeEnabled && (
        <div data-tutorial="ai-assistant">
          <AIInsightBubble
            expenses={expenses}
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            balance={balance}
            paymentSources={customPaymentSources}
            onOpenAssistant={() => setAssistantDialogOpen(true)}
          />
        </div>
      )}

      
      <BottomNav />

      {recurringPanelOpen && (
        <RecurringTransactionsPanel onClose={() => setRecurringPanelOpen(false)} />
      )}

      <RecurringMatchDialog
        open={recurringMatchDialogOpen}
        onOpenChange={setRecurringMatchDialogOpen}
        matches={recurringMatches}
        onConfirm={handleRecurringMatchConfirm}
      />
    </div>
  );
};

export default Index;
