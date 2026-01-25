import { BudgetPlan, BudgetPlanWithOwnership, PERIOD_TYPE_LABELS } from '@/types/budget';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, Users } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';

interface BudgetCardProps {
  budget: BudgetPlanWithOwnership;
  onEdit: (budget: BudgetPlan) => void;
  onDelete: (id: string) => void;
  onClick: (budget: BudgetPlanWithOwnership) => void;
}

export const BudgetCard = ({ budget, onEdit, onDelete, onClick }: BudgetCardProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
      style={{ borderLeftColor: budget.color || '#3b82f6' }}
      onClick={() => onClick(budget)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ backgroundColor: `${budget.color}20` }}
            >
              {budget.icon || '💰'}
            </div>
            <div>
              <h4 className="font-semibold flex items-center gap-2">
                {budget.name}
                {!budget.isOwner && (
                  <Badge variant="secondary" className="text-xs">
                    <Users className="w-3 h-3 mr-1" />
                    {t('budget.shared', 'Dijeljeno')}
                  </Badge>
                )}
              </h4>
              <p className="text-sm text-muted-foreground">
                {PERIOD_TYPE_LABELS[budget.period_type]}
              </p>
            </div>
          </div>

          {budget.isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(budget); }}>
                  <Edit className="w-4 h-4 mr-2" />
                  {t('common.edit', 'Uredi')}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => { e.stopPropagation(); onDelete(budget.id); }}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('common.delete', 'Obriši')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {budget.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {budget.description}
          </p>
        )}

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {!budget.is_active && (
            <Badge variant="outline" className="text-xs">
              {t('budget.inactive', 'Neaktivan')}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
