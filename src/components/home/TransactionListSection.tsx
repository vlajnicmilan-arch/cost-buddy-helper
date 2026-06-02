import { Expense, Category } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { TransactionItem } from '@/components/TransactionItem';
import { TransactionFilters, FilterState } from '@/components/TransactionFilters';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { EmptyState } from '@/components/EmptyState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Receipt, ChevronDown } from 'lucide-react';
import { SwipeableRow } from '@/components/SwipeableRow';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr as hrLocale, enUS, de as deLocale } from 'date-fns/locale';

interface TransactionListSectionProps {
  transactionsOpen: boolean;
  onTransactionsOpenChange: (open: boolean) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  filteredExpenses: Expense[];
  totalExpensesCount: number;
  monthlyTransactionsCount: number;
  expensesLoading: boolean;
  visibleCount: number;
  onShowMore: () => void;
  // Bulk selection
  selectedTransactionIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkCategoryChange: (category: Category) => Promise<void>;
  onBulkPaymentSourceChange: (paymentSource: string) => Promise<void>;
  onBulkBudgetChange?: (budgetId: string | null) => Promise<void>;
  onBulkProjectChange?: (projectId: string | null) => Promise<void>;
  onBulkDelete: () => Promise<void>;
  // Transaction click
  onTransactionClick: (expense: Expense) => void;
  onDeleteExpense: (id: string) => Promise<void>;
  contextLookup: any;
  // Filter options
  allCards: any[];
  paymentSources?: CustomPaymentSource[];
  showScopeFilter: boolean;
  // Layout
  className?: string;
  dataTutorial?: string;
}

export const TransactionListSection = ({
  transactionsOpen,
  onTransactionsOpenChange,
  filters,
  onFiltersChange,
  filteredExpenses,
  totalExpensesCount,
  monthlyTransactionsCount,
  expensesLoading,
  visibleCount,
  onShowMore,
  selectedTransactionIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkCategoryChange,
  onBulkPaymentSourceChange,
  onBulkBudgetChange,
  onBulkProjectChange,
  onBulkDelete,
  onTransactionClick,
  onDeleteExpense,
  contextLookup,
  allCards,
  paymentSources = [],
  showScopeFilter,
  className,
  dataTutorial,
}: TransactionListSectionProps) => {
  const { t, i18n } = useTranslation();

  const dateLocale = i18n.language === 'en' ? enUS : i18n.language === 'de' ? deLocale : hrLocale;
  const currentMonthLabel = format(new Date(), 'LLLL yyyy', { locale: dateLocale });

  // Detect if any filter is active (other than scope='all' default)
  const hasActiveFilters = Boolean(
    filters.searchTerm ||
    filters.dateRange ||
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined ||
    filters.memberId ||
    filters.cardId ||
    filters.categoryId ||
    filters.paymentSource ||
    (filters.scope && filters.scope !== 'all')
  );

  return (
    <Collapsible open={transactionsOpen} onOpenChange={onTransactionsOpenChange} className={className}>
      <div
        className={`glass-card rounded-2xl animate-fade-in transition-all duration-200 border-l-[3px] ${transactionsOpen ? 'p-6' : 'p-4'}`}
        style={{ borderLeftColor: 'hsl(var(--destructive))' }}
      >
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
            data-tutorial={dataTutorial}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              {t('transactions.recent', 'Nedavno')}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground capitalize">
                {hasActiveFilters
                  ? t('transactions.transactionsCountFiltered', { filtered: filteredExpenses.length, total: totalExpensesCount })
                  : `${t('transactions.transactionsCount', { count: monthlyTransactionsCount })} · ${currentMonthLabel}`}
              </span>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${transactionsOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <TransactionFilters
            filters={filters}
            onFiltersChange={onFiltersChange}
            showCardFilter={allCards.length > 0}
            showScopeFilter={showScopeFilter}
            cards={allCards}
          />
          <BulkActionsToolbar
            selectedCount={selectedTransactionIds.size}
            onClearSelection={onClearSelection}
            onSelectAll={onSelectAll}
            totalCount={filteredExpenses.length}
            onBulkCategoryChange={onBulkCategoryChange}
            onBulkPaymentSourceChange={onBulkPaymentSourceChange}
            onBulkBudgetChange={onBulkBudgetChange}
            onBulkProjectChange={onBulkProjectChange}
            onBulkDelete={onBulkDelete}
            selectedExpenses={filteredExpenses.filter(e => selectedTransactionIds.has(e.id))}
          />
          {expensesLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredExpenses.length === 0 ? (
            <EmptyState
              variant="transactions"
              title={
                totalExpensesCount === 0
                  ? t('transactions.noTransactions')
                  : t('transactions.noResults', 'Nema rezultata za odabrane filtere')
              }
              description={totalExpensesCount === 0 ? t('transactions.addFirstTransaction') : undefined}
              compact
            />
          ) : (
            <div className="space-y-1">
              {filteredExpenses.slice(0, visibleCount).map((expense) => (
                <div key={expense.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedTransactionIds.has(expense.id)}
                    onCheckedChange={() => onToggleSelect(expense.id)}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <SwipeableRow
                      disabled={selectedTransactionIds.size > 0}
                      onEdit={() => onTransactionClick(expense)}
                      onDelete={() => { void onDeleteExpense(expense.id); }}
                    >
                      <TransactionItem
                        expense={expense}
                        onDelete={onDeleteExpense}
                        onClick={(e) => {
                          if (selectedTransactionIds.size === 0) {
                            onTransactionClick(e);
                          } else {
                            onToggleSelect(e.id);
                          }
                        }}
                        contextLookup={contextLookup}
                      />
                    </SwipeableRow>
                  </div>
                </div>
              ))}
              {visibleCount < filteredExpenses.length && (
                <Button
                  variant="ghost"
                  className="w-full mt-2 text-sm text-muted-foreground"
                  onClick={onShowMore}
                >
                  {t('transactions.showMore', 'Prikaži još')} ({filteredExpenses.length - visibleCount} {t('transactions.remaining', 'preostalo')})
                </Button>
              )}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
