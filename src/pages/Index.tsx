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
