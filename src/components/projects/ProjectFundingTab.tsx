import { ProjectFunding, ProjectMilestone } from '@/types/project';
import { ProjectIncomeSource } from '@/hooks/useProjectFunding';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Wallet, Loader2, TrendingUp, TrendingDown, PiggyBank, CheckCircle2, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ProjectFundingTabProps {
  projectId: string;
  funding: ProjectFunding[];
  incomeSources: ProjectIncomeSource[];
  milestones: ProjectMilestone[];
  totalAllocated: number;
  projectBudget: number;
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectFundingTab = ({
  projectId,
  funding,
  incomeSources,
  milestones,
  totalAllocated,
  projectBudget,
  isManager,
  loading,
  onRefetch
}: ProjectFundingTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  // Calculate spent from completed milestones
  const completedMilestones = milestones.filter(m => m.status === 'completed');
  const spentFromMilestones = completedMilestones.reduce((sum, m) => sum + (m.budget || 0), 0);
  
  // Pending milestones (in progress or pending)
  const pendingMilestones = milestones.filter(m => m.status === 'in_progress' || m.status === 'pending');
  const reservedForPending = pendingMilestones.reduce((sum, m) => sum + (m.budget || 0), 0);

  const remaining = totalAllocated - spentFromMilestones;
  const usagePercentage = totalAllocated > 0 
    ? (spentFromMilestones / totalAllocated) * 100 
    : 0;

  const hasAnySource = funding.length > 0 || incomeSources.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Financial summary card */}
      <div className="p-4 rounded-lg bg-gradient-to-br from-muted/50 to-muted/30 border">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
          <PiggyBank className="w-4 h-4" />
          {t('projects.financialSummary', 'Financijski pregled')}
        </h3>
        
        <div className="grid grid-cols-3 gap-4 text-center mb-4">
          <div className="p-3 rounded-lg bg-background/50">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-4 h-4 text-income" />
            </div>
            <p className="text-xl font-bold text-income">{formatAmount(totalAllocated)}</p>
            <p className="text-xs text-muted-foreground">{t('projects.received', 'Primljeno')}</p>
          </div>
          
          <div className="p-3 rounded-lg bg-background/50">
            <div className="flex items-center justify-center gap-1 mb-1">
              <CheckCircle2 className="w-4 h-4 text-expense" />
            </div>
            <p className="text-xl font-bold text-expense">{formatAmount(spentFromMilestones)}</p>
            <p className="text-xs text-muted-foreground">{t('projects.completedPhases', 'Završene faze')}</p>
          </div>
          
          <div className="p-3 rounded-lg bg-background/50">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Wallet className="w-4 h-4 text-primary" />
            </div>
            <p className={cn(
              "text-xl font-bold",
              remaining >= 0 ? "text-income" : "text-destructive"
            )}>
              {formatAmount(remaining)}
            </p>
            <p className="text-xs text-muted-foreground">{t('projects.remaining', 'Preostalo')}</p>
          </div>
        </div>

        {/* Reserved for pending milestones */}
        {reservedForPending > 0 && (
          <div className="flex items-center justify-between text-sm p-2 rounded bg-warning/10 mb-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              {t('projects.reservedForPending', 'Rezervirano za aktivne faze')}:
            </span>
            <span className="font-medium">{formatAmount(reservedForPending)}</span>
          </div>
        )}

        {/* Usage progress bar */}
        {totalAllocated > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{t('projects.fundsUsage', 'Iskorištenost sredstava')}</span>
              <span className={cn(
                "font-medium",
                usagePercentage >= 90 ? "text-destructive" : 
                usagePercentage >= 70 ? "text-warning" : "text-muted-foreground"
              )}>
                {usagePercentage.toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={Math.min(usagePercentage, 100)} 
              className={cn(
                "h-2",
                usagePercentage >= 90 && "[&>div]:bg-destructive",
                usagePercentage >= 70 && usagePercentage < 90 && "[&>div]:bg-warning"
              )}
            />
          </div>
        )}
      </div>

      {/* Completed milestones breakdown */}
      {completedMilestones.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-income" />
            {t('projects.completedMilestones', 'Završene faze')} ({completedMilestones.length})
          </h4>
          {completedMilestones.map((m) => (
            <div 
              key={m.id}
              className="p-3 rounded-lg border bg-income/5 border-income/20 flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-income shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.name}</p>
                {m.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    {t('projects.completedOn', 'Završeno')}: {format(new Date(m.completed_at), 'd. MMM yyyy', { locale: hr })}
                  </p>
                )}
              </div>
              <p className="text-lg font-semibold text-expense">
                -{formatAmount(m.budget || 0)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Sources list */}
      {!hasAnySource ? (
        <div className="text-center py-8 text-muted-foreground">
          <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noFunding')}</p>
          <p className="text-sm">{t('projects.noFundingHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Project income transactions (e.g., advances from clients) */}
          {incomeSources.length > 0 && (
            <>
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {t('projects.projectIncome', 'Prihodi projekta')}
              </h4>
              {incomeSources.map((inc) => (
                <div 
                  key={inc.id}
                  className="p-4 rounded-lg border bg-card flex items-center gap-3"
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 bg-income/20"
                  >
                    💵
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{inc.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(inc.date), 'd. MMM yyyy', { locale: hr })}
                    </p>
                  </div>
                  
                  <p className="text-lg font-semibold text-income">
                    +{formatAmount(inc.amount)}
                  </p>
                </div>
              ))}
            </>
          )}

          {/* Linked income sources from project_funding table */}
          {funding.length > 0 && (
            <>
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mt-4">
                <Wallet className="w-4 h-4" />
                {t('projects.linkedSources', 'Povezani izvori')}
              </h4>
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
            </>
          )}
        </div>
      )}
    </div>
  );
};
