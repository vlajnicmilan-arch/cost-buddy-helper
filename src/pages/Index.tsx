import { useExpenses } from '@/hooks/useExpenses';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { RecurringTransactionsPanel } from '@/components/recurring/RecurringTransactionsPanel';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useInstallments } from '@/hooks/useInstallments';
import { useBudgets } from '@/hooks/useBudgets';
import { useProjects } from '@/hooks/useProjects';
import { useAppState } from '@/contexts/AppStateContext';
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
import { Expense, Category } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { Loader2, Smartphone, ChevronDown, ArrowRight, Receipt } from 'lucide-react';
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



const Index = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading, signOut } = useAuth();
  const { storageMode } = useStorage();
  const { formatAmount } = useCurrency();
  const { displayName, aiAssistantEnabled, simpleModeEnabled } = useAppState();
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

  // Back button support for all dialogs
  useBackButton(incomeDialogOpen, () => setIncomeDialogOpen(false));
  useBackButton(expenseDialogOpen, () => setExpenseDialogOpen(false));
  useBackButton(transferDialogOpen, () => setTransferDialogOpen(false));
  useBackButton(detailDialogOpen, () => setDetailDialogOpen(false));
  useBackButton(editDialogOpen, () => setEditDialogOpen(false));
  useBackButton(paymentSourceDialogOpen, () => setPaymentSourceDialogOpen(false));
  useBackButton(assistantDialogOpen, () => setAssistantDialogOpen(false));
  useBackButton(recurringPanelOpen, () => setRecurringPanelOpen(false));

  const { recurringTransactions, processDueTransactions } = useRecurringTransactions();

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
    const totalAccountBalances = customPaymentSources.reduce((sum, source) => sum + (source.balance || 0), 0);
    const remainingObligations = installmentPlans.reduce((sum, plan) => sum + (plan.remainingAmount || 0), 0);
    return totalAccountBalances - remainingObligations;
  }, [customPaymentSources, installmentPlans]);

  useAutoBackup();

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && storageMode === 'cloud') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden pb-20">
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
          onAddExpense={addExpense}
          onCheckDuplicate={checkDuplicate}
          onBulkUpdateExpenses={bulkUpdateExpenses}
          onImportCSV={importFromCSV}
          findDuplicates={findDuplicates}
          existingExpenses={allExpenses}
          onRefetch={refetch}
          onSignOut={handleSignOut}
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
          balance={balance}
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
    </div>
  );
};

export default Index;
