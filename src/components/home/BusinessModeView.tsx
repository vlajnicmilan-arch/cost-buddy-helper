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
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { CSVImportDialog } from '@/components/CSVImportDialog';
import { BusinessBottomNav, BusinessTab } from '@/components/business/BusinessBottomNav';
import { BusinessTransactions } from '@/components/business/BusinessTransactions';
import { BusinessReports } from '@/components/business/BusinessReports';
import { BusinessMore } from '@/components/business/BusinessMore';
import { BusinessWallet } from '@/components/business/BusinessWallet';
import { BusinessProjects } from '@/components/business/BusinessProjects';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, FileSpreadsheet, Plus, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

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
  const [businessScannerOpen, setBusinessScannerOpen] = useState(false);


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
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <ReportsDialog expenses={props.allExpenses} />
              {props.importFromCSV && (
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
                    onImport={props.importFromCSV}
                    findDuplicates={props.findDuplicates}
                    existingExpenses={props.allExpenses}
                    externalOpen={businessImportOpen}
                    onExternalOpenChange={setBusinessImportOpen}
                  />
                </>
              )}
              <AddExpenseDialog onAdd={props.onAddExpense} checkDuplicate={props.checkDuplicate} />
            </div>

            {/* Payment Sources */}
            <PaymentSourcesSection
              customPaymentSources={props.customPaymentSources}
              onSourceClick={props.onPaymentSourceClick}
            />

            {/* Summary Cards */}
            <SummarySection
              balance={props.customPaymentSources.reduce((sum, s) => {
                const bal = s.balance || 0;
                if (props.multiCurrencyEnabled && s.currency && s.currency !== props.currencyCode) {
                  return sum + props.convert(bal, s.currency, props.currencyCode);
                }
                return sum + bal;
              }, 0)}
              netWorth={props.netWorth}
              totalIncome={props.totalIncome}
              totalExpenses={props.totalExpenses}
              totalTransfers={props.totalTransfers}
              monthlyTransfers={props.monthlyTransfers}
              monthlyTransferCount={props.monthlyTransferCount}
              allTransfers={props.allTransfers}
              recurringCount={props.activeRecurringCount}
              isLocalMode={props.isLocalMode}
              simpleModeEnabled={false}
              prevMonthIncome={props.prevMonthIncome ?? 0}
              prevMonthExpenses={props.prevMonthExpenses ?? 0}
              curMonthIncome={props.curMonthIncome ?? 0}
              curMonthExpenses={props.curMonthExpenses ?? 0}
              onIncomeClick={() => props.onIncomeDialogChange(true)}
              onExpenseClick={() => props.onExpenseDialogChange(true)}
              onTransferClick={() => props.onTransferDialogChange(true)}
              onRecurringClick={props.onRecurringPanelOpen}
            />

            {/* Receivables & Payables */}
            {(props.totalReceivable > 0 || props.totalPayable > 0) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-2xl border border-border/50 text-center" style={{ background: 'linear-gradient(135deg, hsl(var(--income) / 0.06) 0%, transparent 100%)' }}>
                  <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.receivables', 'Potraživanja')}</p>
                  <p className="text-sm font-bold text-income">{props.formatAmount(props.totalReceivable)}</p>
                </div>
                <div className="p-3 rounded-2xl border border-border/50 text-center" style={{ background: 'linear-gradient(135deg, hsl(var(--destructive) / 0.06) 0%, transparent 100%)' }}>
                  <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.payables', 'Dugovanja')}</p>
                  <p className="text-sm font-bold text-destructive">{props.formatAmount(props.totalPayable)}</p>
                </div>
              </div>
            )}

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
              onBulkDelete={props.onBulkDelete}
              onTransactionClick={props.onTransactionClick}
              onDeleteExpense={props.onDeleteExpense}
              contextLookup={props.contextLookup}
              allCards={props.allCards}
              showScopeFilter={false}
            />

            {/* Quick Links */}
            <div className="mt-6 space-y-4">
              <QuickLinksSection
                simpleModeEnabled={false}
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
              <AddExpenseDialog
                onAdd={props.onAddExpense}
                checkDuplicate={props.checkDuplicate}
                businessProfileId={props.businessProfile?.id ?? null}
                triggerIcon={<Plus className="w-3.5 h-3.5" />}
                triggerLabel={t('business.transactions.new', 'Novo')}
                triggerClassName="h-9 gap-1 px-3 text-sm"
              />
            }
            scanAction={
              <Button size="sm" variant="outline" className="h-9 gap-1 border-primary/30 text-primary" onClick={() => setBusinessScannerOpen(true)}>
                <ScanLine className="w-3.5 h-3.5" />
                {t('common.scan', 'Skeniraj')}
              </Button>
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
        {businessTab === 'more' && <BusinessMore expenses={props.expenses} />}
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
