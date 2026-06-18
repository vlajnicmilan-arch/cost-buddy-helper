import { Expense, Category } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { FilterState } from '@/components/TransactionFilters';
import { ParsedTransaction } from '@/lib/csvParsers';
import { RecurringMatch } from '@/hooks/useRecurringMatcher';
import { HomeHeader } from '@/components/home/HomeHeader';
import { WalletViewModeChips } from '@/components/wallet/WalletViewModeChips';
import { PaymentSourcesSection } from '@/components/home/PaymentSourcesSection';
import { SummarySection } from '@/components/home/SummarySection';
import { QuickLinksSection } from '@/components/home/QuickLinksSection';
import { TransactionListSection } from '@/components/home/TransactionListSection';
import { SharedDialogs } from '@/components/home/SharedDialogs';
import { FinancialAssistantDialog } from '@/components/FinancialAssistantDialog';
import { CashflowForecast } from '@/components/CashflowForecast';
import { SavingsGoalsSection } from '@/components/savings';
import { WelcomeChecklist } from '@/components/WelcomeChecklist';
import { WelcomeConfetti } from '@/components/WelcomeConfetti';
import { TrialBanner } from '@/components/TrialBanner';
import { ZeroDataQuietState } from '@/components/home/ZeroDataQuietState';
import { GuidedHomeView } from '@/components/home/GuidedHomeView';
import { useGuidedMode } from '@/hooks/useGuidedMode';

import { AIInsightBubble } from '@/components/AIInsightBubble';
import { ActiveIssuesSection } from '@/components/dashboard/ActiveIssuesSection';
import { TrackSection } from '@/components/dashboard/TrackSection';
import { useDashboardScrollDepth } from '@/hooks/useDashboardScrollDepth';
import { BottomNav } from '@/components/BottomNav';
import { ActiveProjectsStrip } from '@/components/home/ActiveProjectsStrip';
import { ProjectWithOwnership } from '@/types/project';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Smartphone, ArrowRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { APP_VERSION } from '@/lib/version';
import { useAppState } from '@/contexts/AppStateContext';
import { useHiddenPaymentSources } from '@/hooks/useHiddenPaymentSources';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BusinessDebtTracker } from '@/components/business/BusinessDebtTracker';
import { UnpaidInvoicesWidget } from '@/components/business/UnpaidInvoicesWidget';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useEffect, useState } from 'react';

interface PersonalModeViewProps {
  displayName: string | null;
  isLocalMode: boolean;
  simpleModeEnabled: boolean;
  aiAssistantEnabled: boolean;
  // Expenses
  expenses: Expense[];
  allExpenses: Expense[];
  expensesLoading: boolean;
  onAddExpense: (expense: any) => Promise<void>;
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  onDeleteExpenseDirect?: (id: string) => Promise<void>;
  onBulkDeleteExpense?: (ids: string[]) => Promise<void>;
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
  balance: number;
  expensesByCategory: Record<string, number>;
  // Payment sources
  customPaymentSources: CustomPaymentSource[];
  multiCurrencyEnabled: boolean;
  currencyCode: string;
  convert: (amount: number, from: string, to: string) => number;
  netWorth: number;
  // Trend
  prevMonthIncome?: number;
  prevMonthExpenses?: number;
  curMonthIncome?: number;
  curMonthExpenses?: number;
  // Budgets & projects
  budgetsCount: number;
  budgetsForAssistant: any[];
  projectsForAssistant: any[];
  projects: ProjectWithOwnership[];
  isBusinessMode: boolean;
  businessProfileName?: string;
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
  // Welcome
  showWelcome: boolean;
  onWelcomeComplete: () => void;
  // Dialogs
  assistantDialogOpen: boolean;
  onAssistantDialogChange: (open: boolean) => void;
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

export const PersonalModeView = (props: PersonalModeViewProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectsModuleEnabled, activeBusinessProfileId, dashboardV2Enabled } = useAppState();
  // Faza 1 modularnog UI-a: izvor istine je `projectsModuleEnabled` (zamijenio
  // legacy `usageProfile === 'finance_only'` check). Strip/CTA-i nestaju kad
  // korisnik isključi modul iz Settings → Moduli.
  const projectsHidden = !projectsModuleEnabled;
  const v2 = dashboardV2Enabled;
  const { hiddenIds } = useHiddenPaymentSources();
  const { registerHandlers, openManualAdd } = useReceiptScan();
  const { totalReceivable, totalPayable } = useBusinessDebts();
  const { formatAmount } = useCurrency();
  const [debtsOpen, setDebtsOpen] = useState(false);
  const isBusinessChip = !!activeBusinessProfileId;

  // Guided home — server-side per-user signal + broj stvarnih unosa.
  // Standardni layout zamjenjuje se ZeroDataQuietState / GuidedHomeView dok
  // korisnik ne dosegne prag ili eksplicitno ne dismissa.
  const guided = useGuidedMode(props.allExpenses.length);
  const showGuidedLayout =
    !props.isLocalMode &&
    !isBusinessChip &&
    guided.ready &&
    (guided.status === 'zero_data' || guided.status === 'guided');

  // Telemetry: scroll depth on dashboard (V2 only — measures the new layout)
  useDashboardScrollDepth(v2);

  // Register this page's add/dup handlers so the global scan dialog
  // dispatches saves to the right place when the user is on Home.
  useEffect(() => {
    return registerHandlers({
      onAdd: props.onAddExpense as any,
      checkDuplicate: props.checkDuplicate,
    });
  }, [registerHandlers, props.onAddExpense, props.checkDuplicate]);

  // Stvaran add-expense entry — identičan onome iz ManualAddTriggerButton-a u
  // headeru. Otvara globalni AddExpenseDialog u manual modu (preživljava
  // Android camera lifecycle). Ne otvarati `TransactionListDialog` (browse).
  const openFirstExpense = () =>
    openManualAdd({ businessProfileId: activeBusinessProfileId ?? null });

  // Guided/zero render — STVARNA izolacija od standardnog homea. Bez header-a,
  // search bara, action gumba, summary kartica, project stripa, issues, lista,
  // WelcomeChecklist. Samo quiet/guided view + BottomNav (+ confetti overlay).
  if (showGuidedLayout) {
    return (
      <div className="min-h-dvh bg-background overflow-x-hidden pb-20">
        <div className="max-w-md mx-auto px-4 py-8">
          {guided.status === 'zero_data' ? (
            <ZeroDataQuietState
              displayName={props.displayName}
              onAddExpense={openFirstExpense}
            />
          ) : (
            <GuidedHomeView
              displayName={props.displayName}
              allExpenses={props.allExpenses}
              onAddExpense={openFirstExpense}
              onDismiss={() => guided.exit('manual_dismiss')}
            />
          )}
        </div>
        {props.showWelcome && (
          <WelcomeConfetti
            displayName={props.displayName || 'Korisnik'}
            onComplete={props.onWelcomeComplete}
          />
        )}
        <BottomNav />
      </div>
    );
  }

  const accountBalance = props.customPaymentSources.reduce((sum, s) => {
    if (hiddenIds.has(s.id)) return sum;
    const bal = s.balance || 0;
    if (props.multiCurrencyEnabled && s.currency && s.currency !== props.currencyCode) {
      return sum + props.convert(bal, s.currency, props.currencyCode);
    }
    return sum + bal;
  }, 0);

  return (
    <div className="min-h-dvh bg-background overflow-x-hidden pb-20">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">


        {/* Financial Assistant Dialog */}
        {!props.isLocalMode && props.aiAssistantEnabled && !props.simpleModeEnabled && (
          <FinancialAssistantDialog
            expenses={props.expenses}
            totalIncome={props.totalIncome}
            totalExpenses={props.totalExpenses}
            balance={props.balance}
            paymentSources={props.customPaymentSources}
            budgets={props.budgetsForAssistant}
            projects={props.projectsForAssistant}
            open={props.assistantDialogOpen}
            onOpenChange={props.onAssistantDialogChange}
            hideTrigger
            businessProfileName={props.businessProfileName}
          />
        )}

        {/* Header */}
        <HomeHeader
          displayName={props.displayName}
          isLocalMode={props.isLocalMode}
          simpleModeEnabled={props.simpleModeEnabled}
          expenses={props.expenses}
          reportsExpenses={props.allExpenses}
          allExpenses={props.allExpenses}
          onAddExpense={props.onAddExpense}
          onCheckDuplicate={props.checkDuplicate}
          onBulkUpdateExpenses={props.bulkUpdateExpenses}
          onImportCSV={props.importFromCSV}
          findDuplicates={props.findDuplicates}
          existingExpenses={props.allExpenses}
          onRefetch={props.refetch}
          onSelectExpense={props.onTransactionClick}
          searchPaymentSources={props.contextLookup?.customPaymentSources}
          searchProjects={props.contextLookup?.projects}
          searchBudgets={props.contextLookup?.budgets}
          searchCustomCategories={props.contextLookup?.customCategories}
        />

        {/* Wallet view mode chips: Sve / Osobno / Poslovno */}
        <div className="mt-3 mb-2">
          <WalletViewModeChips />
        </div>

        {/* Trial Banner */}
        <TrialBanner />





        {/* Local Mode Banner */}
        {props.isLocalMode && (
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

        {/* Welcome Checklist — sekundarni nudge nakon izlaska iz guided faze.
            Skriva se za pro/business, korisnike s business profilom, te nakon
            dismiss-a (per-user lokalno). Guided/zero render je iznad u
            early-return grani; ovdje smo uvijek u standard layoutu. */}
        {!props.isLocalMode && !isBusinessChip && (
          <WelcomeChecklist
            hasPaymentSources={props.customPaymentSources.length > 0}
            hasTransactions={props.allExpenses.length > 0}
            hasBudgets={props.budgetsCount > 0}
            onAddPaymentSource={() => navigate('/wallet')}
            onAddTransaction={() => props.onExpenseDialogChange(true)}
            onAddBudget={() => navigate('/budgets')}
          />
        )}




        {/* V2: Active Projects = HERO (above sources). V1: classic order. */}
        {v2 && !projectsHidden && (
          <TrackSection name="projects_hero">
            <ActiveProjectsStrip
              projects={props.projects}
              isLocalMode={props.isLocalMode}
              simpleModeEnabled={props.simpleModeEnabled}
              isBusinessMode={props.isBusinessMode}
              loading={props.expensesLoading}
            />
          </TrackSection>
        )}

        {/* Payment Sources */}
        <TrackSection name="payment_sources">
          <PaymentSourcesSection
            customPaymentSources={props.customPaymentSources}
            onSourceClick={props.onPaymentSourceClick}
          />
        </TrackSection>

        {/* V1: Active Projects below sources */}
        {!v2 && !projectsHidden && (
          <TrackSection name="projects_strip">
            <ActiveProjectsStrip
              projects={props.projects}
              isLocalMode={props.isLocalMode}
              simpleModeEnabled={props.simpleModeEnabled}
              isBusinessMode={props.isBusinessMode}
              loading={props.expensesLoading}
            />
          </TrackSection>
        )}

        {/* Summary Cards — compact in V2 (only month income+expense) */}
        <TrackSection name="summary">
          <SummarySection
            balance={accountBalance}
            netWorth={props.netWorth}
            totalIncome={props.totalIncome}
            totalExpenses={props.totalExpenses}
            totalTransfers={props.totalTransfers}
            monthlyTransfers={props.monthlyTransfers}
            monthlyTransferCount={props.monthlyTransferCount}
            allTransfers={props.allTransfers}
            recurringCount={props.activeRecurringCount}
            isLocalMode={props.isLocalMode}
            simpleModeEnabled={props.simpleModeEnabled}
            prevMonthIncome={props.prevMonthIncome ?? 0}
            prevMonthExpenses={props.prevMonthExpenses ?? 0}
            curMonthIncome={props.curMonthIncome ?? 0}
            curMonthExpenses={props.curMonthExpenses ?? 0}
            onIncomeClick={() => props.onIncomeDialogChange(true)}
            onExpenseClick={() => props.onExpenseDialogChange(true)}
            onTransferClick={() => props.onTransferDialogChange(true)}
            onRecurringClick={props.onRecurringPanelOpen}
            compact={v2}
          />
        </TrackSection>


        {/* Active Issues — event-driven, persistent, deterministic detectors */}
        {!props.isLocalMode && !props.simpleModeEnabled && (
          <TrackSection name="active_issues">
            <ActiveIssuesSection
              enabled={true}
              projects={props.projects}
              allExpenses={props.allExpenses}
            />
          </TrackSection>
        )}

        {/* Owner-loan / business debts strip — only in business chip view */}
        {isBusinessChip && (totalReceivable > 0 || totalPayable > 0) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              type="button"
              onClick={() => setDebtsOpen(true)}
              className="p-3 rounded-2xl border border-border/50 text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: 'linear-gradient(135deg, hsl(var(--income) / 0.06) 0%, transparent 100%)' }}
            >
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.receivables', 'Potraživanja')}</p>
              <p className="text-sm font-bold text-income">{formatAmount(totalReceivable)}</p>
            </button>
            <button
              type="button"
              onClick={() => setDebtsOpen(true)}
              className="p-3 rounded-2xl border border-border/50 text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: 'linear-gradient(135deg, hsl(var(--destructive) / 0.06) 0%, transparent 100%)' }}
            >
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('business.dashboard.payables', 'Dugovanja')}</p>
              <p className="text-sm font-bold text-destructive">{formatAmount(totalPayable)}</p>
            </button>
          </div>
        )}

        {/* Unpaid invoices widget — business chip only */}
        {isBusinessChip && <UnpaidInvoicesWidget />}

        {/* Cashflow Forecast — V1 only (moved to Wallet tab in V2) */}
        {!v2 && (
        <Collapsible className="group mb-3">
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
        )}

        {/* Main Content Grid */}
        <div className={v2 ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
          <TrackSection name="transactions" className={v2 ? "" : "lg:col-span-2"}>
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
              showScopeFilter={!props.isLocalMode}
              dataTutorial="transactions"
            />
          </TrackSection>

          {/* QuickLinks — V1 only (BottomNav covers this in V2) */}
          {!v2 && (
          <QuickLinksSection
            simpleModeEnabled={props.simpleModeEnabled}
            isLocalMode={props.isLocalMode}
            expensesByCategory={props.expensesByCategory}
            totalExpenses={props.totalExpenses}
            expenses={props.expenses}
            onUpdateExpense={props.onUpdateExpense}
            onDeleteExpense={props.onDeleteExpense}
          />
          )}
        </div>



        {/* Footer */}
        <footer className="mt-8 py-4 text-center border-t border-border/30">
          <p className="text-xs text-muted-foreground">V&M Balance v{APP_VERSION}</p>
        </footer>
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
        onDeleteExpenseDirect={props.onDeleteExpenseDirect}
        onBulkDeleteExpense={props.onBulkDeleteExpense}
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

      {props.showWelcome && (
        <WelcomeConfetti
          displayName={props.displayName || 'Korisnik'}
          onComplete={props.onWelcomeComplete}
        />
      )}

      {props.aiAssistantEnabled && !props.simpleModeEnabled && (
        <div data-tutorial="ai-assistant">
          <AIInsightBubble
            expenses={props.expenses}
            totalIncome={props.totalIncome}
            totalExpenses={props.totalExpenses}
            balance={props.balance}
            paymentSources={props.customPaymentSources}
            onOpenAssistant={() => props.onAssistantDialogChange(true)}
          />
        </div>
      )}

      <Dialog open={debtsOpen} onOpenChange={setDebtsOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle className="text-base">{t('business.more.openInvoices', 'Otvoreni računi')}</DialogTitle>
          </DialogHeader>
          <BusinessDebtTracker />
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};
