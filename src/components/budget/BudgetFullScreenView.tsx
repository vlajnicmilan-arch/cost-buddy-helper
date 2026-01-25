import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BudgetPlanWithOwnership, PERIOD_TYPE_LABELS } from '@/types/budget';
import { BudgetCategoriesTab } from './BudgetCategoriesTab';
import { SavingsGoalsTab } from './SavingsGoalsTab';
import { BudgetMembersTab } from './BudgetMembersTab';
import { X, Grid3X3, Target, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BudgetFullScreenViewProps {
  open: boolean;
  onClose: () => void;
  budget: BudgetPlanWithOwnership | null;
}

export const BudgetFullScreenView = ({ open, onClose, budget }: BudgetFullScreenViewProps) => {
  const { t } = useTranslation();

  if (!budget) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-6 border-b flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${budget.color}20` }}
              >
                {budget.icon || '💰'}
              </div>
              <div>
                <DialogTitle className="text-xl flex items-center gap-2">
                  {budget.name}
                  {!budget.isOwner && (
                    <Badge variant="secondary">
                      <Users className="w-3 h-3 mr-1" />
                      {t('budget.shared', 'Dijeljeno')}
                    </Badge>
                  )}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {PERIOD_TYPE_LABELS[budget.period_type]}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="categories" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 sm:mx-6 mt-4 grid grid-cols-3 w-fit">
            <TabsTrigger value="categories" className="gap-2">
              <Grid3X3 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('budget.categories', 'Kategorije')}</span>
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-2">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">{t('budget.goals', 'Ciljevi')}</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{t('budget.members', 'Članovi')}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <TabsContent value="categories" className="mt-0">
              <BudgetCategoriesTab budgetId={budget.id} isOwner={budget.isOwner} />
            </TabsContent>

            <TabsContent value="goals" className="mt-0">
              <SavingsGoalsTab budgetId={budget.id} isOwner={budget.isOwner} />
            </TabsContent>

            <TabsContent value="members" className="mt-0">
              <BudgetMembersTab budgetId={budget.id} isOwner={budget.isOwner} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
