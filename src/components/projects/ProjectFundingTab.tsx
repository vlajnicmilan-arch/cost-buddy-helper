import { ProjectFunding } from '@/types/project';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Wallet, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ProjectFundingTabProps {
  projectId: string;
  funding: ProjectFunding[];
  totalAllocated: number;
  projectBudget: number;
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectFundingTab = ({
  projectId,
  funding,
  totalAllocated,
  projectBudget,
  isManager,
  loading,
  onRefetch
}: ProjectFundingTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const allocationPercentage = projectBudget > 0 
    ? (totalAllocated / projectBudget) * 100 
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Allocation summary */}
      {projectBudget > 0 && (
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('projects.fundingAllocation')}</span>
            <span className="text-sm text-muted-foreground">
              {formatAmount(totalAllocated)} / {formatAmount(projectBudget)}
            </span>
          </div>
          <Progress value={Math.min(allocationPercentage, 100)} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {allocationPercentage.toFixed(0)}% {t('projects.ofBudgetAllocated')}
          </p>
        </div>
      )}

      {funding.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noFunding')}</p>
          <p className="text-sm">{t('projects.noFundingHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funding.map((f) => (
            <div 
              key={f.id}
              className="p-4 rounded-lg border bg-card flex items-center gap-3"
            >
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: `${f.income_source_color}20` }}
              >
                {f.income_source_icon || '💰'}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{f.income_source_name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatAmount(f.allocated_amount)}
                  {f.percentage && ` (${f.percentage}%)`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
