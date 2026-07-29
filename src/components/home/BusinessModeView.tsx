import { Expense, Category } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { FilterState } from '@/components/TransactionFilters';
import { ParsedTransaction } from '@/lib/csvParsers';
import { RecurringMatch } from '@/hooks/useRecurringMatcher';
import { PaymentSourcesSection } from '@/components/home/PaymentSourcesSection';
import { SummarySection } from '@/components/home/SummarySection';
import { QuickLinksSection } from '@/components/home/QuickLinksSection';
import { TransactionListSection } from '@/components/home/TransactionListSection';
import { SharedDialogs } from '@/components/home/SharedDialogs';
import { ReportsDialog } from '@/components/reports/ReportsDialog';
import { ScanTriggerButton } from '@/components/add-expense/ScanTriggerButton';
import { ManualAddTriggerButton } from '@/components/add-expense/ManualAddTriggerButton';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';
import { useEffect } from 'react';
import { CSVImportDialog } from '@/components/CSVImportDialog';
import { BusinessBottomNav, BusinessTab } from '@/components/business/BusinessBottomNav';
import { BusinessTransactions } from '@/components/business/BusinessTransactions';
import { BusinessReports } from '@/components/business/BusinessReports';
import { BusinessMore } from '@/components/business/BusinessMore';
import { BusinessWallet } from '@/components/business/BusinessWallet';
import { UnpaidInvoicesWidget } from '@/components/business/UnpaidInvoicesWidget';
import { BusinessProjects } from '@/components/business/BusinessProjects';
import { BusinessProjectsOverview } from '@/components/business/BusinessProjectsOverview';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, FileSpreadsheet, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useHiddenPaymentSources } from '@/hooks/useHiddenPaymentSources';

interface BusinessModeViewProps {
  businessTab: BusinessTab;
  onBusinessTabChange: (tab: BusinessTab) => void;
  businessProfile: { id: string; company_name: string; is_vat_payer: boolean; industry_type?: string; enabled_modules?: string[]; theme_color?: string } | null;
  displayName: string | null;
  onBackToPersonal: () => void;
  // Expenses
  expenses: Expense[];
  allExpenses: Expense[];
  expensesLoading: boolean;
  onAddExpense: (expense: any) => Promise<void>;
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  bulkUpdateExpenses: (expenses: Expense[]) => Promise<void>;
  importFromCSV: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates: any;
  checkDuplicate: any;
  refetch: () => void;
  // Totals
  totalIncome: number;
  totalExpenses: number;
  totalTransfers: number;
  monthlyTransfers: number;
  monthlyTransferCount: number;
  totalReceivable: number;
  totalPayable: number;
  expensesByCategory: Record<string, number>;
  // Payment sources
  customPaymentSources: CustomPaymentSource[];
  multiCurrencyEnabled: boolean;
  currencyCode: string;
  convert: (amount: number, from: string, to: string) => number;
  netWorth: number;
  formatAmount: (amount: number) => string;
  // Trend
  prevMonthIncome?: number;
  prevMonthExpenses?: number;
  curMonthIncome?: number;
  curMonthExpenses?: number;
  // Recurring
  activeRecurringCount: number;
  // Filters & selection
  dashboardFilters: FilterState;
  onDashboardFiltersChange: (filters: FilterState) => void;
  filteredDashboardExpenses: Expense[];
  monthlyTransactionsCount: number;
  visibleCount: number;
  onShowMore: () => void;
  selectedTransactionIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkCategoryChange: (category: Category) => Promise<void>;
  onBulkPaymentSourceChange: (paymentSource: string) => Promise<void>;
  onBulkBudgetChange?: (budgetId: string | null) => Promise<void>;
  onBulkProjectChange?: (projectId: string | null) => Promise<void>;
  onBulkDelete: () => Promise<void>;
  contextLookup: any;
  allCards: any[];
  allTransfers: Expense[];
  isLocalMode: boolean;
  // Dialogs
  incomeDialogOpen: boolean;
  onIncomeDialogChange: (open: boolean) => void;
  expenseDialogOpen: boolean;
  onExpenseDialogChange: (open: boolean) => void;
  transferDialogOpen: boolean;
  onTransferDialogChange: (open: boolean) => void;
  selectedTransaction: Expense | null;
  detailDialogOpen: boolean;
  onDetailDialogChange: (open: boolean) => void;
  onEditFromDetail: (expense: Expense) => void;
  editDialogOpen: boolean;
  onEditDialogChange: (open: boolean) => void;
  paymentSourceDialogOpen: boolean;
  onPaymentSourceDialogChange: (open: boolean) => void;
  selectedPaymentSource: CustomPaymentSource | null;
  onPaymentSourceClick: (source: CustomPaymentSource) => void;
  onTransactionClick: (expense: Expense) => void;
  recurringPanelOpen: boolean;
  onRecurringPanelClose: () => void;
  onRecurringPanelOpen: () => void;
  recurringMatchDialogOpen: boolean;
  onRecurringMatchDialogChange: (open: boolean) => void;
  recurringMatches: RecurringMatch[];
  onRecurringMatchConfirm: (selectedIds: string[]) => Promise<void>;
  transactionsOpen: boolean;
  onTransactionsOpenChange: (open: boolean) => void;
}

export const BusinessModeView = (props: BusinessModeViewProps) => {
  const { t } = useTranslation();
  const [businessImportOpen, setBusinessImportOpen] = useState(false);
  const { hiddenIds } = useHiddenPaymentSources();
  const { registerHandlers } = useReceiptScan();

  // Register this page's add/dup handlers so the global scan dialog
  // dispatches saves to the right place (with business_profile_id set).
  useEffect(() => {
    return registerHandlers({
      onAdd: props.onAddExpense as any,
      checkDuplicate: props.checkDuplicate,
    });
  }, [registerHandlers, props.onAddExpense, props.checkDuplicate]);


  const {
    businessTab,
    onBusinessTabChange,
    businessProfile,
    displayName,
    onBackToPersonal,
  } = props;

  return (
    <div className={`business-theme-${businessProfile?.theme_color || 'ocean-blue'} min-h-dvh bg-background pb-20`}>
      {/* Accent bar + Business header */}
      <div className="h-1 bg-primary rounded-b-full" />
      <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-4">
        <div className="flex items-center gap-2 sm:gap-3 mb-4">
          <button
            onClick={onBackToPersonal}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/15 border-2 border-primary/30 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight truncate">
              {businessProfile?.company_name || 'Tvrtka'}
            </h1>
            {displayName && (
              <p className="text-sm text-muted-foreground truncate">
                {t('common.greeting', 'Bok, {{name}}!').replace('{{name}}', displayName)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Business Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4">
        {businessTab === 'dashboard' && (
          <>
            {/* Action buttons — single row */}
            <div className="flex items-center gap-2 mb-4">
              <ReportsDialog
                expenses={props.allExpenses}
                triggerClassName="flex-1 min-w-0 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                triggerLabel={t('business.analysisButton', 'Analiza')}
              />
              {props.importFromCSV && (
                <>
                  <Button
                    variant="outline"
                    className="gap-2 rounded-xl flex-1 min-w-0 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                    onClick={() => setBusinessImportOpen(true)}
                  >
                    <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{t('business.importTransactions', 'Uvoz transakcija')}</span>
                  </Button>
                  <CSVImportDialog
                    onImport={props.importFromCSV}
                    findDuplicates={props.findDuplicates}
                    existingExpenses={props.allExpenses}
                    externalOpen={businessImportOpen}
                    onExternalOpenChange={setBusinessImportOpen}
                  />
                </>
              )}
              <ManualAddTriggerButton
                businessProfileId={props.businessProfile?.id ?? null}
                triggerClassName="flex-shrink-0 font-semibold px-3 text-xs sm:text-sm whitespace-nowrap"
              />
            </div>

            {/* 1. Active projects — top priority */}
            <BusinessProjectsOverview onViewAll={() => props.onBusinessTabChange('projects')} />

            {/* 2. Unpaid invoices (empty state instead of vanishing) */}
            <UnpaidInvoicesWidget showEmptyState />

            {/* Payment Sources */}
            <PaymentSourcesSection
              customPaymentSources={props.customPaymentSources}
              onSourceClick={props.onPaymentSourceClick}
              titleOverride={t('business.accountsOverview', 'Računi – pregled')}
            />

            {/* Secondary rows under Accounts: Available / Net worth / Transfers */}
            <div className="mb-4 rounded-2xl border border-border/50 divide-y divide-border/40">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-muted-foreground">{t('business.dashboard.available', 'Slobodno')}</span>
                <span className={`text-sm font-semibold tabular-nums ${availableBalance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {props.formatAmount(availableBalance)}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-muted-foreground">{t('business.dashboard.netWorth', 'Neto vrijednost')}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {props.formatAmount(props.netWorth)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => props.onTransferDialogChange(true)}
                className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] hover:bg-muted/30 transition-colors rounded-b-2xl"
              >
                <span className="text-xs text-muted-foreground">{t('business.dashboard.transfers', 'Prijenosi')}</span>
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {props.formatAmount(props.monthlyTransfers)}
                </span>
              </button>
            </div>

            {/* 3. Profit / Loss this month */}
            <BusinessProfitCard
              curMonthIncome={props.curMonthIncome ?? 0}
              curMonthExpenses={props.curMonthExpenses ?? 0}
              prevMonthIncome={props.prevMonthIncome ?? 0}
              prevMonthExpenses={props.prevMonthExpenses ?? 0}
              onIncomeClick={() => props.onIncomeDialogChange(true)}
              onExpenseClick={() => props.onExpenseDialogChange(true)}
            />


            {/* Receivables & Payables — always visible (0 € muted) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-2xl border border-border/50 text-center" style={{ background: 'linear-gradient(135deg, hsl(var(--income) / 0.06) 0%, transparent 100%)' }}>
                <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.receivables', 'Potraživanja')}</p>
                <p className={`text-sm font-bold ${props.totalReceivable > 0 ? 'text-income' : 'text-muted-foreground/60'}`}>
                  {props.formatAmount(props.totalReceivable)}
                </p>
              </div>
              <div className="p-3 rounded-2xl border border-border/50 text-center" style={{ background: 'linear-gradient(135deg, hsl(var(--destructive) / 0.06) 0%, transparent 100%)' }}>
                <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.payables', 'Dugovanja')}</p>
                <p className={`text-sm font-bold ${props.totalPayable > 0 ? 'text-destructive' : 'text-muted-foreground/60'}`}>
                  {props.formatAmount(props.totalPayable)}
                </p>
              </div>
            </div>

            {/* Recent Transactions */}
            <TransactionListSection
              transactionsOpen={props.transactionsOpen}
              onTransactionsOpenChange={props.onTransactionsOpenChange}
              filters={props.dashboardFilters}
              onFiltersChange={props.onDashboardFiltersChange}
              filteredExpenses={props.filteredDashboardExpenses}
              totalExpensesCount={props.expenses.length}
              monthlyTransactionsCount={props.monthlyTransactionsCount}
              expensesLoading={props.expensesLoading}
              visibleCount={props.visibleCount}
              onShowMore={props.onShowMore}
              selectedTransactionIds={props.selectedTransactionIds}
              onToggleSelect={props.onToggleSelect}
              onSelectAll={props.onSelectAll}
              onClearSelection={props.onClearSelection}
              onBulkCategoryChange={props.onBulkCategoryChange}
              onBulkPaymentSourceChange={props.onBulkPaymentSourceChange}
              onBulkBudgetChange={props.onBulkBudgetChange}
              onBulkProjectChange={props.onBulkProjectChange}
              onBulkDelete={props.onBulkDelete}
              onTransactionClick={props.onTransactionClick}
              onDeleteExpense={props.onDeleteExpense}
              contextLookup={props.contextLookup}
              allCards={props.allCards}
              paymentSources={props.customPaymentSources}
              showScopeFilter={false}
            />

            {/* Quick Links */}
            <div className="mt-6 space-y-4">
              <QuickLinksSection
                isLocalMode={false}
                expensesByCategory={props.expensesByCategory}
                totalExpenses={props.totalExpenses}
                expenses={props.expenses}
                onUpdateExpense={props.onUpdateExpense}
                onDeleteExpense={props.onDeleteExpense}
              />
            </div>
          </>
        )}
        {businessTab === 'wallet' && <BusinessWallet />}
        {businessTab === 'transactions' && (
          <BusinessTransactions
            expenses={props.expenses}
            onAddClick={() => {}}
            addAction={
              <ManualAddTriggerButton
                businessProfileId={props.businessProfile?.id ?? null}
                triggerIcon={<Plus className="w-3.5 h-3.5" />}
                triggerLabel={t('business.transactions.new', 'Novo')}
                triggerClassName="h-9 gap-1 px-3 text-sm"
              />
            }
            scanAction={
              <ScanTriggerButton
                businessProfileId={props.businessProfile?.id ?? null}
                triggerLabel={t('common.scan', 'Skeniraj')}
                triggerClassName="h-9 gap-1 px-3 text-sm border-primary/30 text-primary"
              />
            }
            onEditExpense={props.onUpdateExpense}
            onDeleteExpense={props.onDeleteExpense}
            onImportCSV={props.importFromCSV}
            findDuplicates={props.findDuplicates}
            existingExpenses={props.allExpenses}
          />
        )}
        {businessTab === 'projects' && (
          <BusinessProjects onRefreshExpenses={props.refetch} />
        )}
        {businessTab === 'reports' && (
          <BusinessReports
            expenses={props.expenses}
            companyName={businessProfile?.company_name || 'Tvrtka'}
          />
        )}
        {businessTab === 'more' && <BusinessMore expenses={props.expenses} companyName={businessProfile?.company_name || ''} />}
      </div>

      {/* Dialogs */}
      <SharedDialogs
        incomeDialogOpen={props.incomeDialogOpen}
        onIncomeDialogChange={props.onIncomeDialogChange}
        expenseDialogOpen={props.expenseDialogOpen}
        onExpenseDialogChange={props.onExpenseDialogChange}
        expenses={props.expenses}
        totalIncome={props.totalIncome}
        totalExpenses={props.totalExpenses}
        onUpdateExpense={props.onUpdateExpense}
        onDeleteExpense={props.onDeleteExpense}
        transferDialogOpen={props.transferDialogOpen}
        onTransferDialogChange={props.onTransferDialogChange}
        allTransfers={props.allTransfers}
        totalTransfers={props.totalTransfers}
        selectedTransaction={props.selectedTransaction}
        detailDialogOpen={props.detailDialogOpen}
        onDetailDialogChange={props.onDetailDialogChange}
        onEditFromDetail={props.onEditFromDetail}
        editDialogOpen={props.editDialogOpen}
        onEditDialogChange={props.onEditDialogChange}
        paymentSourceDialogOpen={props.paymentSourceDialogOpen}
        onPaymentSourceDialogChange={props.onPaymentSourceDialogChange}
        selectedPaymentSource={props.selectedPaymentSource}
        allExpenses={props.allExpenses}
        onImportCSV={props.importFromCSV}
        findDuplicates={props.findDuplicates}
        recurringPanelOpen={props.recurringPanelOpen}
        onRecurringPanelClose={props.onRecurringPanelClose}
        recurringMatchDialogOpen={props.recurringMatchDialogOpen}
        onRecurringMatchDialogChange={props.onRecurringMatchDialogChange}
        recurringMatches={props.recurringMatches}
        onRecurringMatchConfirm={props.onRecurringMatchConfirm}
      />



      <BusinessBottomNav activeTab={businessTab} onTabChange={onBusinessTabChange} />
    </div>
  );
};
