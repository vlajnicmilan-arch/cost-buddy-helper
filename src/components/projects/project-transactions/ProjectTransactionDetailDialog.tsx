import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, Pencil, Trash2, Target } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { resolveCategory } from '@/hooks/useResolvedCategory';
import { TransactionItemsExpander } from '@/components/TransactionItemsExpander';
import { TransactionNotesThread } from '@/components/TransactionNotesThread';
import type { ProjectMilestone } from '@/types/project';
import type { ProjectExpense } from './types';

interface ProjectTransactionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ProjectExpense | null;
  customCategories: any[];
  milestones: ProjectMilestone[];
  formatAmount: (n: number) => string;
  projectId: string;
  isManager: boolean;
  userId: string | undefined;
  onEdit: (expense: ProjectExpense) => void;
  onDelete: (id: string) => void;
  onNoteAdded: () => void;
}

export const ProjectTransactionDetailDialog = ({
  open,
  onOpenChange,
  expense,
  customCategories,
  milestones,
  formatAmount,
  projectId,
  isManager,
  userId,
  onEdit,
  onDelete,
  onNoteAdded,
}: ProjectTransactionDetailDialogProps) => {
  const { t } = useTranslation();

  const getMilestoneName = (mId: string | null | undefined) => {
    if (!mId) return null;
    return milestones.find((m) => m.id === mId)?.name || null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            {t('transactions.details', 'Detalji transakcije')}
          </DialogTitle>
        </DialogHeader>

        {expense && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center text-lg shrink-0">
                {resolveCategory(expense.category, customCategories).icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{expense.description}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(expense.date), 'd. MMM yyyy', { locale: hr })}
                  {getMilestoneName(expense.milestone_id) && (
                    <>
                      {' '}
                      • <Target className="w-3 h-3 inline" /> {getMilestoneName(expense.milestone_id)}
                    </>
                  )}
                </p>
              </div>
              <div
                className={cn(
                  'font-mono font-medium shrink-0',
                  expense.type === 'income' ? 'text-income' : 'text-expense',
                )}
              >
                {expense.type === 'income' ? '+' : '-'}
                {formatAmount(expense.amount)}
              </div>
            </div>

            <TransactionItemsExpander expenseId={expense.id} isExpanded={true} onToggle={() => {}} />

            {(() => {
              const authorId = expense.submitted_by || expense.user_id;
              const isOwnExpense = authorId === userId;
              return isManager || isOwnExpense ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      onOpenChange(false);
                      onEdit(expense);
                    }}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    {t('common.edit', 'Uredi')}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      onOpenChange(false);
                      onDelete(expense.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('common.delete', 'Obriši')}
                  </Button>
                </div>
              ) : null;
            })()}

            <TransactionNotesThread expenseId={expense.id} projectId={projectId} onNoteAdded={onNoteAdded} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
