import { useExpenses } from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { supabase } from '@/integrations/supabase/client';
import { SummaryCard } from '@/components/SummaryCard';
import { TransactionItem } from '@/components/TransactionItem';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { BankConnection } from '@/components/BankConnection';
import { BackupRestore } from '@/components/BackupRestore';
import { TransactionListDialog } from '@/components/TransactionListDialog';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TransferListDialog } from '@/components/TransferListDialog';
import { BulkEditDropdown } from '@/components/BulkEditDropdown';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { IncomeSourcesPanel } from '@/components/income-sources/IncomeSourcesPanel';
import { CustomCategoriesPanel } from '@/components/custom-categories/CustomCategoriesPanel';
import { CustomPaymentSourcesPanel } from '@/components/custom-payment-sources/CustomPaymentSourcesPanel';
import { PaymentSourceTransactionsDialog } from '@/components/PaymentSourceTransactionsDialog';
import { ReportsDialog } from '@/components/reports/ReportsDialog';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { TransactionFilters, FilterState, defaultFilters, applyFilters } from '@/components/TransactionFilters';
import { Expense, Category } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { TrendingUp, TrendingDown, LogOut, Loader2, Smartphone, Cloud, ArrowLeftRight, LayoutDashboard, Wallet, RefreshCw, ChevronDown, CreditCard, Grid3X3 } from 'lucide-react';
import { SettingsDialog } from '@/components/SettingsDialog';
import logo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { WelcomeConfetti } from '@/components/WelcomeConfetti';

const Index = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading, signOut } = useAuth();
  const { storageMode } = useStorage();
  const { formatAmount } = useCurrency();
  const navigate = useNavigate();
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
  
  // Bulk selection state
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());

  // Welcome animation state
  const [showWelcome, setShowWelcome] = useState(false);

  // Get user display name
  const [displayName, setDisplayName] = useState<string>('');
  
  useEffect(() => {
    const loadDisplayName = async () => {
      // Try localStorage first (works for both modes)
      const localName = localStorage.getItem('user_display_name');
      if (localName) {
        setDisplayName(localName);
      } else if (user) {
        // For cloud mode, try to fetch from profiles
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .single();
        
        if (data?.display_name) {
          setDisplayName(data.display_name);
          localStorage.setItem('user_display_name', data.display_name);
        }
      }
      
      // Check if we should show welcome animation
      const shouldShowWelcome = localStorage.getItem('show_welcome_animation');
      if (shouldShowWelcome === 'true') {
        setShowWelcome(true);
        localStorage.removeItem('show_welcome_animation');
      }
    };
    loadDisplayName();

    // Listen for name changes from settings
    const handleNameChange = (event: CustomEvent<string>) => {
      setDisplayName(event.detail);
    };
    window.addEventListener('displayNameChanged', handleNameChange as EventListener);
    
    return () => {
      window.removeEventListener('displayNameChanged', handleNameChange as EventListener);
    };
  }, [user]);

  // Get custom payment sources for card filtering (declare before useExpenses to use in callback)
  const { customPaymentSources, refetch: refetchPaymentSources } = useCustomPaymentSources();

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
    totalExpenses, 
    totalIncome, 
    totalTransfers,
    monthlyTransfers,
    monthlyTransferCount,
    balance,
    expensesByCategory,
    isLocalMode,
    refetch
  } = useExpenses({
    onBalanceUpdated: refetchPaymentSources
  });

  // Get all transfers for the dialog
  const allTransfers = useMemo(() => 
    expenses.filter(e => e.type === 'transfer').sort((a, b) => b.date.getTime() - a.date.getTime()),
    [expenses]
  );

  // Get all cards from all custom payment sources
  const allCards = useMemo(() => {
    return customPaymentSources.flatMap(source => source.cards || []);
  }, [customPaymentSources]);

  // Apply filters to dashboard expenses
  const filteredDashboardExpenses = useMemo(() => {
    return applyFilters(expenses, dashboardFilters);
  }, [expenses, dashboardFilters]);

  // Initialize auto-backup for local mode
  useAutoBackup();

  // Clear selection when filters change
  useEffect(() => {
    setSelectedTransactionIds(new Set());
  }, [dashboardFilters]);

  // Bulk selection handlers
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTransactionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = filteredDashboardExpenses.map(e => e.id);
    setSelectedTransactionIds(new Set(allIds));
  }, [filteredDashboardExpenses]);

  const handleClearSelection = useCallback(() => {
    setSelectedTransactionIds(new Set());
  }, []);

  const handleBulkCategoryChange = useCallback(async (category: Category) => {
    const selectedExpenses = filteredDashboardExpenses.filter(e => selectedTransactionIds.has(e.id));
    const updatedExpenses = selectedExpenses.map(e => ({ ...e, category }));
    await bulkUpdateExpenses(updatedExpenses);
    setSelectedTransactionIds(new Set());
    toast.success(`Kategorija promijenjena za ${selectedExpenses.length} transakcija`);
  }, [filteredDashboardExpenses, selectedTransactionIds, bulkUpdateExpenses]);

  const handleBulkPaymentSourceChange = useCallback(async (paymentSource: string) => {
    const selectedExpenses = filteredDashboardExpenses.filter(e => selectedTransactionIds.has(e.id));
    const updatedExpenses = selectedExpenses.map(e => ({ ...e, paymentSource }));
    await bulkUpdateExpenses(updatedExpenses);
    setSelectedTransactionIds(new Set());
    toast.success(`Izvor plaćanja promijenjen za ${selectedExpenses.length} transakcija`);
  }, [filteredDashboardExpenses, selectedTransactionIds, bulkUpdateExpenses]);

  const handleBulkDelete = useCallback(async () => {
    const idsToDelete = Array.from(selectedTransactionIds);
    for (const id of idsToDelete) {
      await deleteExpense(id);
    }
    setSelectedTransactionIds(new Set());
    toast.success(`Obrisano ${idsToDelete.length} transakcija`);
  }, [selectedTransactionIds, deleteExpense]);

  useEffect(() => {
    // Only redirect to auth if using cloud mode and not logged in
    if (!authLoading && !user && storageMode === 'cloud') {
      navigate('/auth');
    }
  }, [user, authLoading, navigate, storageMode]);

  const handleSignOut = async () => {
    if (isLocalMode) {
      // For local mode, go to setup to change storage
      navigate('/setup');
    } else {
      try {
        await signOut();
      } catch (error) {
        console.error('Sign out error:', error);
      } finally {
        // Always navigate to auth after signout attempt
        navigate('/auth', { replace: true });
      }
    }
  };

  if (authLoading && storageMode === 'cloud') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && storageMode === 'cloud') {
    // Redirect to auth if not logged in
    navigate('/auth', { replace: true });
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header */}
        <header className="flex flex-col gap-4 mb-6 sm:mb-8">
          {/* Top row: Logo, title, and navigation icons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="V&M Balance" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
              <div>
                <h1 className="text-xl sm:text-3xl font-bold text-foreground tracking-tight">
                  {displayName ? t('common.greeting', 'Bok, {{name}}!').replace('{{name}}', displayName) : 'V&M Balance'}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm sm:text-base text-muted-foreground hidden sm:block">{t('common.manageFinances')}</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
                          {isLocalMode ? (
                            <>
                              <Smartphone className="w-3 h-3" />
                              {t('common.local')}
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3 h-3" />
                              {t('common.cloud')}
                            </>
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{isLocalMode ? t('common.localData') : t('common.cloudData')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
            
            {/* Navigation icons (right side) */}
            <div className="flex items-center gap-1 sm:gap-2">
              {!isLocalMode && <NotificationsDropdown />}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => navigate('/dashboard')}
                      className="rounded-xl h-9 w-9"
                    >
                      <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Dashboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <SettingsDialog onDataImported={refetch} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('settings.title', 'Postavke')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {!isLocalMode && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleSignOut}
                  className="rounded-xl h-9 w-9"
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              )}
            </div>
          </div>
          
          {/* Bottom row: Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <BulkEditDropdown expenses={expenses} onUpdateExpenses={bulkUpdateExpenses} />
            <ReportsDialog expenses={expenses} />
            <AddExpenseDialog onAdd={addExpense} />
          </div>
        </header>

        {/* Local Mode Banner */}
        {isLocalMode && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-muted/50 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t('common.localMode')}</p>
                <p className="text-xs text-muted-foreground">{t('common.dataStaysLocal')}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/setup')}
              className="rounded-lg text-xs"
            >
              {t('common.switchToCloud')}
            </Button>
          </motion.div>
        )}

        {/* Finances Card - Collapsible Payment Sources */}
        {customPaymentSources.length > 0 && (
          <Collapsible className="mb-4">
            <CollapsibleTrigger asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 sm:p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm cursor-pointer hover:bg-card/80 hover:border-primary/30 transition-all w-full"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm sm:text-base font-semibold">{t('common.finances', 'Financije')}</p>
                      <p className="text-xs text-muted-foreground">
                        {customPaymentSources.length} {customPaymentSources.length === 1 ? t('common.account', 'račun') : t('common.accounts', 'računa')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={`text-base sm:text-xl font-bold ${customPaymentSources.reduce((sum, s) => sum + s.balance, 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatAmount(customPaymentSources.reduce((sum, s) => sum + s.balance, 0))}
                    </p>
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
                  </div>
                </div>
              </motion.div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3"
              >
                {customPaymentSources.map((source) => (
                  <motion.div
                    key={source.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => {
                      setSelectedPaymentSource(source);
                      setPaymentSourceDialogOpen(true);
                    }}
                    className="p-3 sm:p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm cursor-pointer hover:bg-card/80 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-base"
                        style={{ backgroundColor: source.color + '20', color: source.color }}
                      >
                        {source.icon}
                      </span>
                      <span className="text-xs sm:text-sm font-medium truncate flex-1">{source.name}</span>
                    </div>
                    <p className={`text-base sm:text-lg font-bold ${source.balance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatAmount(source.balance)}
                    </p>
                    {source.cards && source.cards.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {source.cards.length} {source.cards.length === 1 ? t('common.card') : t('common.cards')}
                      </p>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 sm:p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.balance')}</span>
            </div>
            <p className={`text-base sm:text-xl font-bold ${balance >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {formatAmount(balance)}
            </p>
          </div>
          <div 
            className="p-3 sm:p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm text-center cursor-pointer hover:bg-card/80 transition-colors"
            onClick={() => setIncomeDialogOpen(true)}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.totalIncome')}</span>
            </div>
            <p className="text-base sm:text-xl font-bold text-primary">
              {formatAmount(totalIncome)}
            </p>
          </div>
          <div 
            className="p-3 sm:p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm text-center cursor-pointer hover:bg-card/80 transition-colors"
            onClick={() => setExpenseDialogOpen(true)}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-destructive" />
              <span className="text-xs sm:text-sm text-muted-foreground">{t('summary.totalExpenses')}</span>
            </div>
            <p className="text-base sm:text-xl font-bold text-destructive">
              {formatAmount(totalExpenses)}
            </p>
          </div>
        </div>

        {/* Transfers Summary - Clickable with toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 bg-muted/30 border border-border/50 rounded-xl"
        >
          <div 
            onClick={() => setTransferDialogOpen(true)}
            className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{t('transactions.transfers')}</p>
                <p className="text-xs text-muted-foreground">
                  {allTransfers.length === 0 
                    ? t('transactions.noTransfers')
                    : `${allTransfers.length} ${allTransfers.length === 1 ? t('transactions.transfer').toLowerCase() : t('transactions.transfers').toLowerCase()}`}
                </p>
              </div>
            </div>
            <div className="text-right">
            <p className="font-mono font-semibold text-lg text-muted-foreground">
              ↔ {formatAmount(totalTransfers)}
            </p>
              <p className="text-xs text-muted-foreground">{t('common.clickForDetails')} →</p>
            </div>
          </div>
          
          {/* Quick stats row */}
          {allTransfers.length > 0 && monthlyTransferCount > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('transactions.thisMonth')}: {monthlyTransferCount} {monthlyTransferCount === 1 ? t('transactions.transfer').toLowerCase() : t('transactions.transfers').toLowerCase()}</span>
              <span className="font-mono">{formatAmount(monthlyTransfers)}</span>
            </div>
          )}
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Income Sources - Mobile First (visible only on mobile, above transactions) */}
          <div className="lg:hidden">
            <IncomeSourcesPanel
              expenses={allExpenses}
              onUpdateExpense={updateExpense}
              onDeleteExpense={deleteExpense}
              onRefreshExpenses={refetch}
            />
          </div>

          {/* Transactions */}
          <Collapsible open={transactionsOpen} onOpenChange={setTransactionsOpen} className="lg:col-span-2">
            <div className={`glass-card rounded-2xl animate-fade-in transition-all duration-200 ${transactionsOpen ? 'p-6' : 'p-4'}`}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between hover:opacity-80 transition-opacity">
                  <h2 className="text-lg font-semibold">{t('transactions.recentTransactions')}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {filteredDashboardExpenses.length !== expenses.length 
                        ? `${filteredDashboardExpenses.length} / ${expenses.length}`
                        : expenses.length} {expenses.length === 1 ? 'transakcija' : 'transakcija'}
                    </span>
                    <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${transactionsOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                {/* Filters */}
                <TransactionFilters
                  filters={dashboardFilters}
                  onFiltersChange={setDashboardFilters}
                  showCardFilter={allCards.length > 0}
                  cards={allCards}
                />

                {/* Bulk Actions Toolbar */}
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
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground">
                      {expenses.length === 0 
                        ? t('transactions.noTransactions')
                        : 'Nema rezultata za odabrane filtere'}
                    </p>
                    {expenses.length === 0 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('transactions.addFirstTransaction')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
                    <AnimatePresence>
                      {filteredDashboardExpenses.map((expense) => (
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
                            />
                          </div>
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Income Sources - Desktop (hidden on mobile since it's shown above) */}
            <div className="hidden lg:block">
              <IncomeSourcesPanel
                expenses={allExpenses}
                onUpdateExpense={updateExpense}
                onDeleteExpense={deleteExpense}
                onRefreshExpenses={refetch}
              />
            </div>
            <Accordion type="multiple" className="space-y-4">
              <AccordionItem value="categories" className="border-none">
                <AccordionTrigger className="glass-card rounded-2xl px-6 py-4 hover:no-underline [&[data-state=open]]:rounded-b-none">
                  <div className="flex items-center gap-2">
                    <Grid3X3 className="h-5 w-5 text-primary" />
                    <span className="text-lg font-semibold">Po kategorijama</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="glass-card rounded-b-2xl px-6 pb-6 pt-0 border-t-0">
                  <CategoryBreakdown 
                    expensesByCategory={expensesByCategory} 
                    total={totalExpenses}
                    expenses={expenses}
                    onUpdateExpense={updateExpense}
                    onDeleteExpense={deleteExpense}
                    hideHeader
                  />
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="payment-sources" className="border-none">
                <AccordionTrigger className="glass-card rounded-2xl px-6 py-4 hover:no-underline [&[data-state=open]]:rounded-b-none">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <span className="text-lg font-semibold">Prilagođeni izvori plaćanja</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="glass-card rounded-b-2xl px-6 pb-6 pt-0 border-t-0">
                  <CustomPaymentSourcesPanel hideHeader />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
            <CustomCategoriesPanel />
            <BankConnection onImportCSV={importFromCSV} findDuplicates={findDuplicates} />
            <BackupRestore onDataImported={refetch} />
          </div>
          </div>
        </div>

        {/* Footer with version */}
        <footer className="mt-8 py-4 text-center border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            V&M Balance v1.0.0
          </p>
        </footer>

      {/* Transaction Dialogs */}
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

      {/* Transfer List Dialog */}
      <TransferListDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        transfers={allTransfers}
        totalAmount={totalTransfers}
      />

      {/* Transaction Detail Dialog */}
      <TransactionDetailDialog
        expense={selectedTransaction}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={(expense) => {
          setSelectedTransaction(expense);
          setDetailDialogOpen(false);
          setEditDialogOpen(true);
        }}
        onDelete={deleteExpense}
      />

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        expense={selectedTransaction}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={updateExpense}
      />

      {/* Payment Source Transactions Dialog */}
      <PaymentSourceTransactionsDialog
        open={paymentSourceDialogOpen}
        onOpenChange={setPaymentSourceDialogOpen}
        paymentSource={selectedPaymentSource}
        expenses={expenses}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
      />

      {/* Welcome Animation with Confetti */}
      {showWelcome && (
        <WelcomeConfetti
          displayName={displayName || 'Korisnik'}
          onComplete={() => setShowWelcome(false)}
        />
      )}
    </div>
  );
};

export default Index;
