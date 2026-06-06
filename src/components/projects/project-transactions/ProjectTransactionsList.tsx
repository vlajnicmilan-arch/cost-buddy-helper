import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileText, Search, Printer, User, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { resolveCategory } from '@/hooks/useResolvedCategory';
import { ConfidentialityPicker } from '@/components/ConfidentialityPicker';
import type { ConfidentialityLevel } from '@/lib/reportDesign';
import type { ProjectMilestone } from '@/types/project';
import type { ProjectExpense } from './types';
import type { ProjectExpenseTotals } from '@/lib/projectTransactionFilters';

interface ProjectTransactionsListProps {
  expenses: ProjectExpense[]; // all (for empty state)
  filteredExpenses: ProjectExpense[];
  totals: ProjectExpenseTotals;
  profiles: Record<string, string>;
  milestones: ProjectMilestone[];
  customCategories: any[];
  formatAmount: (n: number) => string;
  userId: string | undefined;
  hasActiveFilters: boolean;
  confidentiality: ConfidentialityLevel;
  setConfidentiality: (v: ConfidentialityLevel) => void;
  onOpenDetail: (expense: ProjectExpense) => void;
  onPrint: () => void;
}

export const ProjectTransactionsList = ({
  expenses,
  filteredExpenses,
  totals,
  profiles,
  milestones,
  customCategories,
  formatAmount,
  userId,
  hasActiveFilters,
  confidentiality,
  setConfidentiality,
  onOpenDetail,
  onPrint,
}: ProjectTransactionsListProps) => {
  const { t } = useTranslation();

  const getMilestoneName = (mId: string | null | undefined) => {
    if (!mId) return null;
    return milestones.find((m) => m.id === mId)?.name || null;
  };

  if (expenses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{t('projects.noTransactions')}</p>
        <p className="text-sm">{t('projects.noTransactionsHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {filteredExpenses.length > 0 && (
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs text-muted-foreground">
            {hasActiveFilters
              ? t('filters.resultsCount', '{{count}} rezultata', { count: filteredExpenses.length })
              : `${filteredExpenses.length} ${t('projects.transactions', 'transakcija')}`}
          </span>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                  <Printer className="w-3.5 h-3.5" />
                  {t('common.print', 'Ispis')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5 border-b mb-1">
                  <ConfidentialityPicker value={confidentiality} onChange={setConfidentiality} />
                </div>
                <DropdownMenuItem onClick={onPrint}>
                  <Printer className="w-4 h-4 mr-2" />
                  {t('common.print', 'Ispis')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {filteredExpenses.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('filters.noResults', 'Nema rezultata za odabrane filtere')}</p>
        </div>
      ) : (
        <>
          {filteredExpenses.map((expense) => {
            const categoryInfo = resolveCategory(expense.category, customCategories);
            const isIncome = expense.type === 'income';
            const milestoneName = getMilestoneName(expense.milestone_id);
            const authorId = expense.submitted_by || expense.user_id;
            const authorName = profiles[authorId] || 'Član';
            const isOwnExpense = authorId === userId;

            return (
              <div
                key={expense.id}
                className="flex items-center gap-2 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer active:bg-muted/70"
                onClick={() => onOpenDetail(expense)}
              >
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                  style={{ backgroundColor: `hsl(var(--${categoryInfo.color}) / 0.15)` }}
                >
                  {categoryInfo.icon}
                </div>

                <div className="flex-1 min-w-0 mr-2">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-foreground truncate text-sm leading-tight">
                      {expense.description}
                    </p>
                    {expense.expense_nature && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5 py-0 h-4 shrink-0 border',
                          expense.expense_nature === 'regular'
                            ? 'border-income/50 text-income bg-income/10'
                            : 'border-destructive/50 text-destructive bg-destructive/10',
                        )}
                      >
                        {expense.expense_nature === 'regular'
                          ? t('transactions.regular', 'Redovan')
                          : t('transactions.extraordinary', 'Vanredan')}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground leading-tight">
                    <span className="flex items-center gap-0.5 shrink-0">
                      <User className="w-3 h-3" />
                      {isOwnExpense ? t('common.you', 'Ti') : authorName}
                    </span>
                    <span className="text-muted-foreground/50">•</span>
                    <span className="truncate max-w-[60px]">{categoryInfo.name}</span>
                    {milestoneName && (
                      <>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="flex items-center gap-0.5 truncate max-w-[80px]">
                          <Target className="w-3 h-3 shrink-0" />
                          {milestoneName}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0 gap-0.5">
                  <p
                    className={cn(
                      'font-mono font-bold text-sm leading-tight',
                      isIncome ? 'text-income' : 'text-expense',
                    )}
                  >
                    {isIncome ? '+' : '-'}
                    {formatAmount(expense.amount)}
                  </p>
                  <span className="text-[10px] text-muted-foreground/70">
                    {format(new Date(expense.date), 'd. MMM', { locale: hr })}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="mt-3 p-3 rounded-lg bg-muted/50 border flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium">{t('common.total', 'Ukupno')}:</span>
            {totals.totalExpenses > 0 && (
              <span className="flex items-center gap-1 text-expense font-medium">
                <TrendingDown className="w-3.5 h-3.5" />-{formatAmount(totals.totalExpenses)}
              </span>
            )}
            {totals.totalIncome > 0 && (
              <span className="flex items-center gap-1 text-income font-medium">
                <TrendingUp className="w-3.5 h-3.5" />+{formatAmount(totals.totalIncome)}
              </span>
            )}
            <span className={cn('font-bold ml-auto', totals.net >= 0 ? 'text-income' : 'text-expense')}>
              {totals.net >= 0 ? '+' : ''}
              {formatAmount(totals.net)}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
