import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { getCategoryInfo } from '@/types/expense';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { FileText, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
}

interface ProjectTransactionsTabProps {
  projectId: string;
  expenses: ProjectExpense[];
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectTransactionsTab = ({
  projectId,
  expenses,
  isManager,
  loading,
  onRefetch
}: ProjectTransactionsTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
    <div className="space-y-2">
      {expenses.map((expense) => {
        const categoryInfo = getCategoryInfo(expense.category as any);
        const isIncome = expense.type === 'income';

        return (
          <div 
            key={expense.id}
            className="p-3 rounded-lg border bg-card flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg">
              {categoryInfo.icon}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{expense.description}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{categoryInfo.name}</span>
                <span>•</span>
                <span>{format(new Date(expense.date), 'd. MMM yyyy', { locale: hr })}</span>
              </div>
            </div>

            <div className={cn(
              "font-mono font-medium flex items-center gap-1",
              isIncome ? "text-income" : "text-expense"
            )}>
              {isIncome ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {isIncome ? '+' : '-'}{formatAmount(expense.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
