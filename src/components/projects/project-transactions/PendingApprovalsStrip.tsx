import { Button } from '@/components/ui/button';
import { Clock, TrendingUp, TrendingDown, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { resolveCategory } from '@/hooks/useResolvedCategory';
import { useTranslation } from 'react-i18next';

interface PendingTx {
  id: string;
  description: string;
  category: string;
  date: string;
  type: string;
  amount: number;
  submitter_name?: string | null;
}

interface PendingApprovalsStripProps {
  pendingTransactions: PendingTx[];
  pendingCount: number;
  customCategories: any[];
  formatAmount: (n: number) => string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const PendingApprovalsStrip = ({
  pendingTransactions,
  pendingCount,
  customCategories,
  formatAmount,
  onApprove,
  onReject,
}: PendingApprovalsStripProps) => {
  const { t } = useTranslation();

  return (
    <div className="p-4 rounded-lg border-2 border-warning/50 bg-warning/10 space-y-3">
      <div className="flex items-center gap-2 text-warning-foreground">
        <Clock className="w-5 h-5" />
        <span className="font-medium">
          {t('projects.pendingApproval', 'Transakcije na čekanju')} ({pendingCount})
        </span>
      </div>

      <div className="space-y-2">
        {pendingTransactions.map((tx) => {
          const categoryInfo = resolveCategory(tx.category, customCategories);
          const isIncome = tx.type === 'income';

          return (
            <div
              key={tx.id}
              className="p-3 rounded-lg bg-card border flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                {categoryInfo.icon}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{tx.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>{categoryInfo.name}</span>
                  <span>•</span>
                  <span>{format(new Date(tx.date), 'd. MMM yyyy', { locale: hr })}</span>
                  {tx.submitter_name && (
                    <>
                      <span>•</span>
                      <span className="text-warning-foreground">
                        {t('projects.submittedBy', 'Podnio')}: {tx.submitter_name}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  'font-mono font-medium flex items-center gap-1 shrink-0',
                  isIncome ? 'text-income' : 'text-expense',
                )}
              >
                {isIncome ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isIncome ? '+' : '-'}
                {formatAmount(tx.amount)}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-income hover:text-income hover:bg-income/10"
                  onClick={() => onApprove(tx.id)}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => onReject(tx.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
